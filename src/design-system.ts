// Deliberate consumption contract: this barrel re-exports design-system
// catalog primitives via deep imports into pirate-solid-design-system/src/...
// so the linked workspace package needs no built export map. Route code must
// import through this barrel and never reach through the DS implementation
// directly. An exports map in the DS repo is a shared-file change deferred to
// a later coordinated PR.
export {
  Button,
  buttonVariants,
  type ButtonProps,
} from "pirate-solid-design-system/src/components/actions/button/button";
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "pirate-solid-design-system/src/components/overlays/dialog/dialog";
export {
  TextField,
  TextFieldDescription,
  TextFieldInput,
  TextFieldLabel,
} from "pirate-solid-design-system/src/components/forms/text-field/text-field";
