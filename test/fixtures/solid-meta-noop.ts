// Head tags are not what the server-markup gate asserts, and @solidjs/meta's
// head group context is installed by the application document rather than by a
// bare renderToStream call. Rendering them as nothing keeps the gate focused on
// the page body it exists to read.
export const Title = () => null;
export const Meta = () => null;
export const Link = () => null;
export const Style = () => null;
export const Script = () => null;
export const Base = () => null;
export const Stylesheet = () => null;
export const Head = (props: { children?: unknown }) => props.children;
