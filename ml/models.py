"""
Model architectures.

Built with tf_keras (Keras 2) because TensorFlow.js loads Keras 2 "layers"
models directly. Only layers that TF.js supports are used in the models that can
ship to the browser (static_cnn and every dynamic model except the MLP baseline). The baselines exist to compare
against in the report.
"""
from __future__ import annotations

import tf_keras as keras
from tf_keras import layers

from features import FRAME_SIZE, SEQ_FRAME_SIZE, SEQUENCE_LENGTH

# ---------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------


def conv_bn_relu(x, filters, kernel, name, strides=1, conv=layers.Conv2D, dilation=1):
    x = conv(
        filters, kernel, strides=strides, padding="same", dilation_rate=dilation,
        use_bias=False, name=f"{name}_conv",
    )(x)
    x = layers.BatchNormalization(name=f"{name}_bn")(x)
    return layers.ReLU(name=f"{name}_relu")(x)


def squeeze_excite(x, name, pool, ratio=4):
    """
    Channel attention (Squeeze-and-Excitation). Average every channel over the
    whole input, pass that summary through a tiny bottleneck MLP, and get one
    weight in 0..1 per channel. The network learns which feature maps matter
    for THIS input and turns the rest down.
    """
    channels = x.shape[-1]
    s = pool(name=f"{name}_squeeze")(x)
    s = layers.Dense(max(8, channels // ratio), activation="relu", name=f"{name}_reduce")(s)
    s = layers.Dense(channels, activation="sigmoid", name=f"{name}_gate")(s)
    s = layers.Reshape((1,) * (len(x.shape) - 2) + (channels,), name=f"{name}_shape")(s)
    return layers.Multiply(name=f"{name}_scale")([x, s])


def residual_block(x, filters, kernel, name, strides=1, conv=layers.Conv2D, pool=layers.GlobalAveragePooling2D,
                   dilation=1, drop=None):
    """
    conv-BN-ReLU-conv-BN + squeeze-excite, added back to the input (ResNet).
    The skip connection lets gradients flow straight through, so deeper stacks
    still train. A 1x1 conv on the shortcut matches shapes when they change.
    """
    shortcut = x
    y = conv_bn_relu(x, filters, kernel, f"{name}_a", strides=strides, conv=conv, dilation=dilation)
    y = conv(filters, kernel, padding="same", dilation_rate=dilation, use_bias=False,
             name=f"{name}_b_conv")(y)
    y = layers.BatchNormalization(name=f"{name}_b_bn")(y)
    y = squeeze_excite(y, f"{name}_se", pool)
    if drop is not None:
        y = drop(y)
    if strides != 1 or shortcut.shape[-1] != filters:
        shortcut = conv(filters, 1, strides=strides, use_bias=False, name=f"{name}_proj_conv")(shortcut)
        shortcut = layers.BatchNormalization(name=f"{name}_proj_bn")(shortcut)
    y = layers.Add(name=f"{name}_add")([shortcut, y])
    return layers.ReLU(name=f"{name}_out")(y)


# ---------------------------------------------------------------------------
# Static signs (letters and digits): one frame in, one label out
# ---------------------------------------------------------------------------


def static_cnn(num_classes: int, width: int = 48) -> keras.Model:
    """
    The frame vector (132 values) is reshaped to a tiny 2 x 22 "image" with 3
    channels: one row per hand, one column per landmark, channels = (x, y, z).

    Kernels of shape (1, 3) slide ALONG a hand, so neighbouring landmarks on a
    finger are seen together, and because the same kernel is used on both rows
    the two hands share weights. A final (2, 3) kernel looks at both hands at
    once and fuses them.
    """
    inp = keras.Input((FRAME_SIZE,), name="features")
    x = layers.Reshape((2, 22, 3), name="as_image")(inp)
    x = conv_bn_relu(x, width, (1, 3), "stem")
    x = residual_block(x, width, (1, 3), "res1")
    x = residual_block(x, width * 2, (1, 3), "res2", strides=(1, 2))
    x = residual_block(x, width * 2, (1, 3), "res3")
    x = layers.Conv2D(width * 3, (2, 3), padding="valid", use_bias=False, name="fuse_conv")(x)
    x = layers.BatchNormalization(name="fuse_bn")(x)
    x = layers.ReLU(name="fuse_relu")(x)
    x = layers.GlobalAveragePooling2D(name="pool")(x)
    x = layers.Dropout(0.3, name="drop1")(x)
    x = layers.Dense(128, activation="relu", name="embedding")(x)
    x = layers.Dropout(0.3, name="drop2")(x)
    out = layers.Dense(num_classes, activation="softmax", name="probs")(x)
    return keras.Model(inp, out, name="static_cnn")


def static_mlp(num_classes: int) -> keras.Model:
    """Baseline: fully connected layers, no convolution, no weight sharing."""
    inp = keras.Input((FRAME_SIZE,), name="features")
    x = inp
    for i, units in enumerate((256, 128)):
        x = layers.Dense(units, name=f"fc{i + 1}")(x)
        x = layers.BatchNormalization(name=f"fc{i + 1}_bn")(x)
        x = layers.ReLU(name=f"fc{i + 1}_relu")(x)
        x = layers.Dropout(0.3, name=f"fc{i + 1}_drop")(x)
    out = layers.Dense(num_classes, activation="softmax", name="probs")(x)
    return keras.Model(inp, out, name="static_mlp")


# ---------------------------------------------------------------------------
# Dynamic signs (words): a 32-frame window in, one label out
# ---------------------------------------------------------------------------


def attention_pool(x, name):
    """
    Temporal attention pooling. A Dense(1) scores every time step, a softmax
    over time turns the scores into weights that sum to 1, and the output is
    the weighted average of the steps. Unlike plain average pooling, the model
    can focus on the frames that identify the sign and ignore the transition
    frames. (The average is used instead of a sum; the missing constant factor
    T is absorbed by the next layer.)
    """
    steps = x.shape[1]
    w = layers.Dense(1, name=f"{name}_score")(x)
    w = layers.Flatten(name=f"{name}_flat")(w)
    w = layers.Softmax(name=f"{name}_weights")(w)
    w = layers.Reshape((steps, 1), name=f"{name}_shape")(w)
    x = layers.Multiply(name=f"{name}_apply")([x, w])
    return layers.GlobalAveragePooling1D(name=f"{name}_sum")(x)


def dynamic_tcn(num_classes: int, width: int = 96) -> keras.Model:
    """
    Temporal convolutional network. Conv1D kernels slide along TIME.

    The dilation rate doubles block by block (1, 2, 4, 8), so the receptive
    field grows exponentially: 3 -> 7 -> 15 -> 31 -> 63 frames after only four
    blocks, enough to see the whole 32-frame window, with far fewer weights
    than a wide kernel and none of the step-by-step recurrence of an LSTM.
    """
    inp = keras.Input((SEQUENCE_LENGTH, SEQ_FRAME_SIZE), name="features")
    # 1x1 conv = the same small dense layer applied to every frame: a learned frame embedding.
    x = conv_bn_relu(inp, width, 1, "embed", conv=layers.Conv1D)
    for i, dilation in enumerate((1, 2, 4, 8)):
        filters = width if i < 2 else int(width * 1.5)
        x = residual_block(
            x, filters, 3, f"tcn{i + 1}", conv=layers.Conv1D, pool=layers.GlobalAveragePooling1D,
            dilation=dilation, drop=layers.SpatialDropout1D(0.15, name=f"tcn{i + 1}_drop"),
        )
    x = attention_pool(x, "attn")
    x = layers.Dropout(0.4, name="drop")(x)
    x = layers.Dense(160, activation="relu", name="embedding")(x)
    x = layers.Dropout(0.3, name="drop2")(x)
    out = layers.Dense(num_classes, activation="softmax", name="probs")(x)
    return keras.Model(inp, out, name="dynamic_tcn")


def dynamic_bilstm(num_classes: int, units: int = 96) -> keras.Model:
    """Baseline: a bidirectional LSTM reads the window forwards and backwards."""
    inp = keras.Input((SEQUENCE_LENGTH, SEQ_FRAME_SIZE), name="features")
    x = layers.Dense(units, activation="relu", name="embed")(inp)
    x = layers.Bidirectional(layers.LSTM(units, return_sequences=True, dropout=0.2), name="bilstm1")(x)
    x = layers.Bidirectional(layers.LSTM(units, dropout=0.2), name="bilstm2")(x)
    x = layers.Dropout(0.4, name="drop")(x)
    out = layers.Dense(num_classes, activation="softmax", name="probs")(x)
    return keras.Model(inp, out, name="dynamic_bilstm")


def dynamic_gru(num_classes: int, units: int = 128) -> keras.Model:
    """Baseline: a single GRU, the lightest recurrent option."""
    inp = keras.Input((SEQUENCE_LENGTH, SEQ_FRAME_SIZE), name="features")
    x = layers.Dense(units, activation="relu", name="embed")(inp)
    x = layers.GRU(units, dropout=0.2, name="gru")(x)
    x = layers.Dropout(0.4, name="drop")(x)
    out = layers.Dense(num_classes, activation="softmax", name="probs")(x)
    return keras.Model(inp, out, name="dynamic_gru")


def dynamic_mlp(num_classes: int) -> keras.Model:
    """Baseline: flatten the window and ignore that it is a sequence."""
    inp = keras.Input((SEQUENCE_LENGTH, SEQ_FRAME_SIZE), name="features")
    x = layers.Flatten(name="flat")(inp)
    for i, units in enumerate((512, 256)):
        x = layers.Dense(units, name=f"fc{i + 1}")(x)
        x = layers.BatchNormalization(name=f"fc{i + 1}_bn")(x)
        x = layers.ReLU(name=f"fc{i + 1}_relu")(x)
        x = layers.Dropout(0.4, name=f"fc{i + 1}_drop")(x)
    out = layers.Dense(num_classes, activation="softmax", name="probs")(x)
    return keras.Model(inp, out, name="dynamic_mlp")


# ---------------------------------------------------------------------------
# Transformer and Inception-TCN. Built only from layers TensorFlow.js supports
# (Dense, Conv1D, Dot, Softmax, LayerNormalization, Concatenate, Add,
# MaxPooling1D), so they can ship to the browser like the TCN.
# ---------------------------------------------------------------------------


def self_attention(x, d: int, heads: int, name: str):
    """
    Multi-head scaled dot-product self-attention (Vaswani et al., 2017), written
    out with plain layers because TensorFlow.js has no MultiHeadAttention layer.

    For each head h: Q = x Wq, K = x Wk, V = x Wv (Dense layers, d/heads wide),
    scores = Q K^T (a batched Dot over the feature axis, T x T), weights =
    softmax over the keys, context = weights V. The heads are concatenated and
    mixed by a final Dense. Every frame can look at every other frame in one
    step, so a sign's start and end are compared directly.

    The 1/sqrt(d_k) scale is folded into Wq at initialisation (variance 1/d_k),
    which keeps the softmax unsaturated at the start of training.
    """
    dk = d // heads
    contexts = []
    for h in range(heads):
        q = layers.Dense(dk, kernel_initializer=keras.initializers.VarianceScaling(1.0 / dk), name=f"{name}_q{h}")(x)
        k = layers.Dense(dk, name=f"{name}_k{h}")(x)
        v = layers.Dense(dk, name=f"{name}_v{h}")(x)
        scores = layers.Dot(axes=(2, 2), name=f"{name}_scores{h}")([q, k])
        weights = layers.Softmax(axis=-1, name=f"{name}_weights{h}")(scores)
        contexts.append(layers.Dot(axes=(2, 1), name=f"{name}_context{h}")([weights, v]))
    x = layers.Concatenate(name=f"{name}_heads")(contexts) if heads > 1 else contexts[0]
    return layers.Dense(d, name=f"{name}_out")(x)


def transformer_block(x, d: int, heads: int, ff: int, drop: float, name: str):
    """Pre-norm encoder block: x + Attention(LN(x)), then x + FFN(LN(x))."""
    h = layers.LayerNormalization(epsilon=1e-6, name=f"{name}_ln1")(x)
    h = self_attention(h, d, heads, f"{name}_mha")
    h = layers.Dropout(drop, name=f"{name}_drop1")(h)
    x = layers.Add(name=f"{name}_add1")([x, h])
    h = layers.LayerNormalization(epsilon=1e-6, name=f"{name}_ln2")(x)
    h = layers.Dense(ff, activation="relu", name=f"{name}_ff1")(h)
    h = layers.Dense(d, name=f"{name}_ff2")(h)
    h = layers.Dropout(drop, name=f"{name}_drop2")(h)
    return layers.Add(name=f"{name}_add2")([x, h])


def dynamic_transformer(num_classes: int, d: int = 96, heads: int = 4, depth: int = 3) -> keras.Model:
    """
    Transformer encoder over the 32-frame window.

    Position is given by a convolutional positional encoding (Chu et al., 2021):
    a width-5 Conv1D added to the frame embeddings. Its zero padding tells
    frames near the ends of the window where they are, and it needs no extra
    input, unlike a learned position table.
    """
    inp = keras.Input((SEQUENCE_LENGTH, SEQ_FRAME_SIZE), name="features")
    x = layers.Dense(d, name="embed")(inp)
    pos = layers.Conv1D(d, 5, padding="same", name="pos_conv")(x)
    x = layers.Add(name="pos_add")([x, pos])
    x = layers.Dropout(0.1, name="embed_drop")(x)
    for i in range(depth):
        x = transformer_block(x, d, heads, 2 * d, 0.15, f"enc{i + 1}")
    x = layers.LayerNormalization(epsilon=1e-6, name="enc_ln")(x)
    x = attention_pool(x, "attn")
    x = layers.Dropout(0.4, name="drop")(x)
    x = layers.Dense(160, activation="relu", name="embedding")(x)
    x = layers.Dropout(0.3, name="drop2")(x)
    out = layers.Dense(num_classes, activation="softmax", name="probs")(x)
    return keras.Model(inp, out, name="dynamic_transformer")


def inception_block(x, filters: int, dilation: int, name: str):
    """
    GoogLeNet's Inception module, turned to run along time. Four branches see
    the same input at different temporal scales and are concatenated:
      1x1 conv            (this frame only)
      3-wide conv         (short motion)
      5-wide conv         (longer motion)
      3-wide max pool + 1x1 conv (the strongest response nearby)
    The dilation widens all of them as the network gets deeper. A residual
    shortcut (ResNet) is added around the module.
    """
    b = filters // 4
    b1 = conv_bn_relu(x, b, 1, f"{name}_b1", conv=layers.Conv1D)
    b3 = conv_bn_relu(x, b, 3, f"{name}_b3", conv=layers.Conv1D, dilation=dilation)
    b5 = conv_bn_relu(x, b, 5, f"{name}_b5", conv=layers.Conv1D, dilation=dilation)
    bp = layers.MaxPooling1D(3, strides=1, padding="same", name=f"{name}_pool")(x)
    bp = conv_bn_relu(bp, b, 1, f"{name}_bp", conv=layers.Conv1D)
    y = layers.Concatenate(name=f"{name}_cat")([b1, b3, b5, bp])
    y = layers.SpatialDropout1D(0.15, name=f"{name}_drop")(y)
    if x.shape[-1] != filters:
        x = layers.Conv1D(filters, 1, use_bias=False, name=f"{name}_proj_conv")(x)
        x = layers.BatchNormalization(name=f"{name}_proj_bn")(x)
    y = layers.Add(name=f"{name}_add")([x, y])
    return layers.ReLU(name=f"{name}_out")(y)


def dynamic_inception(num_classes: int, width: int = 96) -> keras.Model:
    """Inception-TCN: a temporal CNN whose blocks are Inception modules with growing dilation."""
    inp = keras.Input((SEQUENCE_LENGTH, SEQ_FRAME_SIZE), name="features")
    x = conv_bn_relu(inp, width, 1, "embed", conv=layers.Conv1D)
    for i, (filters, dilation) in enumerate(((width, 1), (width, 2), (128, 4), (128, 8))):
        x = inception_block(x, filters, dilation, f"inc{i + 1}")
    x = attention_pool(x, "attn")
    x = layers.Dropout(0.4, name="drop")(x)
    x = layers.Dense(160, activation="relu", name="embedding")(x)
    x = layers.Dropout(0.3, name="drop2")(x)
    out = layers.Dense(num_classes, activation="softmax", name="probs")(x)
    return keras.Model(inp, out, name="dynamic_inception")


STATIC_MODELS = {"cnn": static_cnn, "mlp": static_mlp}
DYNAMIC_MODELS = {
    "tcn": dynamic_tcn,
    "transformer": dynamic_transformer,
    "inception": dynamic_inception,
    "bilstm": dynamic_bilstm,
    "gru": dynamic_gru,
    "mlp": dynamic_mlp,
}
