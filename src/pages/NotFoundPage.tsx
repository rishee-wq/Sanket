import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from '../lib/router';

export default function NotFoundPage() {
  return (
    <main className="dots grid min-h-dvh place-items-center px-6">
      <div className="board w-full max-w-[640px] p-7 text-center">
        <p className="tag">Error 404 · यह पता नहीं मिला</p>
        <h1 className="display mt-3 text-[clamp(64px,13vw,128px)]">No such stop.</h1>
        <p className="mt-3 text-[17px]">The address may be mistyped, or the page has moved.</p>
        <Link to="/" className="btn btn-ink mt-6">
          Back to Sanket <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    </main>
  );
}
