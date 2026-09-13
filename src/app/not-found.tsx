import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty">
      <h1>That page isn’t in this workspace.</h1>
      <p>Return to the dashboard to keep moving.</p>
      <Link className="button primary mt-5" href="/">
        Back to dashboard
      </Link>
    </div>
  );
}
