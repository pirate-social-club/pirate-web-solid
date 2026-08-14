import { getRequestEvent } from "@solidjs/web";

export default function NotFoundRoute() {
  const event = getRequestEvent();
  if (event) event.locals.routeStatus = 404;
  return (
    <main data-route-path="*404" data-route-status="404">
      <h1>Not found</h1>
      <p>The requested route does not exist.</p>
      <a href="/">Return home</a>
    </main>
  );
}
