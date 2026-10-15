import React from 'react';
import { ArrowRight } from 'lucide-react';
import { HandField } from '../components/landing/HandField';
import { Link } from '../lib/router';

export default function NotFoundPage() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-black px-6 text-center text-ink">
      <div className="absolute inset-0 opacity-50">
        <HandField density={0.7} />
      </div>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative">
        <p className="font-mono text-sm text-saffron">404</p>
        <h1 className="mt-3 font-serif text-5xl sm:text-7xl">
          This page <em className="text-glow">went quiet.</em>
        </h1>
        <p className="mt-4 text-white/60">The address may be mistyped, or the page has moved.</p>
        <Link
          to="/"
          className="group mx-auto mt-10 flex w-fit items-center gap-4 rounded-full bg-white py-2 pl-6 pr-2 text-lg font-medium text-[#0a0400]"
        >
          Back to Sanket
          <span className="grid h-10 w-10 place-items-center rounded-full bg-saffron-deep">
            <ArrowRight className="h-5 w-5 text-white" />
          </span>
        </Link>
      </div>
    </main>
  );
}
