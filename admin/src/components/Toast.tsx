import { toast as sonnerToast } from "sonner";

export function useToast() {
  return {
    toast: (msg: string) => {
      sonnerToast(msg);
    },
  };
}
