"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty" role="alert">
      <h1>Something interrupted this page.</h1>
      <p>
        Your saved workspace is still in this browser. Try opening this page
        again.
      </p>
      <button onClick={reset} className="button primary mt-5">
        Try again
      </button>
    </div>
  );
}
