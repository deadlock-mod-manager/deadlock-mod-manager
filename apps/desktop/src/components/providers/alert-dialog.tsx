import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deadlock-mods/ui/components/alert-dialog";
import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { Trash } from "@phosphor-icons/react";
import * as React from "react";

export const AlertDialogContext = React.createContext<
  (
    params: AlertAction,
  ) => Promise<
    AlertAction["type"] extends "alert" | "confirm" ? boolean : null | string
  >
>(() => null!);

type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";

const defaultCancelButtonText: string = "Cancel";
const defaultActionButtonText: string = "Okay";

export type DialogTone = "default" | "destructive";

export type AlertAction =
  | {
      type: "alert";
      title: string;
      body?: string;
      cancelButton?: string;
      cancelButtonVariant?: ButtonVariant;
    }
  | {
      type: "confirm";
      title: string;
      body?: string;
      tone?: DialogTone;
      cancelButton?: string;
      actionButton?: string;
      cancelButtonVariant?: ButtonVariant;
      actionButtonVariant?: ButtonVariant;
    }
  | {
      type: "prompt";
      title: string;
      body?: string;
      cancelButton?: string;
      actionButton?: string;
      defaultValue?: string;
      cancelButtonVariant?: ButtonVariant;
      actionButtonVariant?: ButtonVariant;
      inputProps?: React.DetailedHTMLProps<
        React.InputHTMLAttributes<HTMLInputElement>,
        HTMLInputElement
      >;
    }
  | { type: "close" };

type AlertDialogState = {
  open: boolean;
  title: string;
  body: string;
  type: "alert" | "confirm" | "prompt";
  tone: DialogTone;
  cancelButton: string;
  actionButton: string;
  cancelButtonVariant: ButtonVariant;
  actionButtonVariant: ButtonVariant;
  defaultValue?: string;
  inputProps?: React.PropsWithoutRef<
    React.DetailedHTMLProps<
      React.InputHTMLAttributes<HTMLInputElement>,
      HTMLInputElement
    >
  >;
};

export function alertDialogReducer(
  state: AlertDialogState,
  action: AlertAction,
): AlertDialogState {
  switch (action.type) {
    case "close":
      return { ...state, open: false };
    case "alert":
    case "confirm":
    case "prompt":
      return {
        ...state,
        body: "",
        open: true,
        ...action,
        tone: ("tone" in action && action.tone) || "default",
        cancelButton:
          action.cancelButton ||
          (action.type === "alert"
            ? defaultActionButtonText
            : defaultCancelButtonText),
        actionButton:
          ("actionButton" in action && action.actionButton) ||
          defaultActionButtonText,
        cancelButtonVariant: action.cancelButtonVariant || "ghost",
        actionButtonVariant:
          ("actionButtonVariant" in action && action.actionButtonVariant) ||
          "destructive",
      };
    default:
      return state;
  }
}

export const AlertDialogProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [state, dispatch] = React.useReducer(alertDialogReducer, {
    open: false,
    title: "",
    body: "",
    type: "alert",
    tone: "default",
    cancelButton: defaultCancelButtonText,
    actionButton: defaultActionButtonText,
    cancelButtonVariant: "default",
    actionButtonVariant: "default",
  });

  const resolveRef = React.useRef<(value: boolean | string | null) => void>(
    () => {
      // Default no-op function
    },
  );

  const close = () => {
    dispatch({ type: "close" });
    resolveRef.current?.(false);
  };

  const confirm = (value?: string) => {
    dispatch({ type: "close" });
    resolveRef.current?.(value ?? true);
  };

  const dialog = React.useCallback(async <T extends AlertAction>(params: T) => {
    dispatch(params);

    return new Promise<
      T["type"] extends "alert" | "confirm" ? boolean : null | string
    >((resolve) => {
      resolveRef.current = resolve as (value: boolean | string | null) => void;
    });
  }, []);

  return (
    <AlertDialogContext.Provider value={dialog}>
      {children}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            close();
          }
        }}
        open={state.open}>
        <AlertDialogContent asChild>
          <form
            className={cn(
              state.tone === "destructive" && "gap-6 border-destructive/25",
            )}
            onSubmit={(event) => {
              event.preventDefault();
              confirm(event.currentTarget.prompt?.value);
            }}>
            {state.tone === "destructive" ? (
              <AlertDialogHeader className='flex-row items-start gap-4'>
                <div className='flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive'>
                  <Trash className='size-5' weight='bold' />
                </div>
                <div className='flex flex-col gap-1.5'>
                  <AlertDialogTitle>{state.title}</AlertDialogTitle>
                  {state.body ? (
                    <AlertDialogDescription>
                      {state.body}
                    </AlertDialogDescription>
                  ) : null}
                </div>
              </AlertDialogHeader>
            ) : (
              <AlertDialogHeader>
                <AlertDialogTitle>{state.title}</AlertDialogTitle>
                {state.body ? (
                  <AlertDialogDescription>{state.body}</AlertDialogDescription>
                ) : null}
              </AlertDialogHeader>
            )}
            {state.type === "prompt" && (
              <Input
                defaultValue={state.defaultValue}
                name='prompt'
                {...state.inputProps}
              />
            )}
            <AlertDialogFooter>
              <Button
                onClick={close}
                type='button'
                variant={state.cancelButtonVariant}>
                {state.cancelButton}
              </Button>
              {state.type === "alert" ? null : (
                <Button type='submit' variant={state.actionButtonVariant}>
                  {state.actionButton}
                </Button>
              )}
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </AlertDialogContext.Provider>
  );
};

type Params<T extends "alert" | "confirm" | "prompt"> =
  | Omit<Extract<AlertAction, { type: T }>, "type">
  | string;

export function useConfirm() {
  const dialog = React.useContext(AlertDialogContext);

  return React.useCallback(
    (params: Params<"confirm">) => {
      return dialog({
        ...(typeof params === "string" ? { title: params } : params),
        type: "confirm",
      });
    },
    [dialog],
  );
}

export function usePrompt() {
  const dialog = React.useContext(AlertDialogContext);

  return (params: Params<"prompt">) =>
    dialog({
      ...(typeof params === "string" ? { title: params } : params),
      type: "prompt",
    });
}

export function useAlert() {
  const dialog = React.useContext(AlertDialogContext);
  return (params: Params<"alert">) =>
    dialog({
      ...(typeof params === "string" ? { title: params } : params),
      type: "alert",
    });
}
