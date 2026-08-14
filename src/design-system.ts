// Explicit package boundary: product UI imports catalog primitives here and
// never reaches through the design-system implementation from route code.
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
