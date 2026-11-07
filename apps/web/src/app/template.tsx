/** Fades each route in. See `.sg-page` in globals.css for why this is opacity only. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="sg-page">{children}</div>;
}
