// Explicit package boundary: product UI imports catalog primitives here and
// never reaches through the package implementation from route code.
export {
  Button,
  buttonVariants,
  type ButtonProps,
} from "@pirate/web-solid-ui";
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@pirate/web-solid-ui";
export {
  TextField,
  TextFieldDescription,
  TextFieldInput,
  TextFieldLabel,
} from "@pirate/web-solid-ui";
