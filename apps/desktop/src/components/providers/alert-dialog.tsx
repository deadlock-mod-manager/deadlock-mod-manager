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
import {
  type Icon,
  InfoIcon,
  QuestionIcon,
  WarningIcon,
} from "@phosphor-icons/react";
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
      icon?: Icon;
      cancelButton?: string;
      cancelButtonVariant?: ButtonVariant;
    }
  | {
      type: "confirm";
      title: string;
      body?: string;
      /** Shown in the header tile; defaults by tone. */
      icon?: Icon;
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
      icon?: Icon;
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
  icon?: Icon;
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
        icon: undefined,
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

const defaultIcon = (state: AlertDialogState): Icon => {
  if (state.tone === "destructive") return WarningIcon;
  return state.type === "alert" ? InfoIcon : QuestionIcon;
};

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
        <AlertDialogContent
          asChild
          className={cn(
            "gap-0 overflow-hidden p-0 sm:max-w-md",
            state.tone === "destructive" && "border-destructive/30",
          )}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              confirm(event.currentTarget.prompt?.value);
            }}>
            <div className='flex items-start gap-4 p-6'>
              <DialogIcon
                icon={state.icon ?? defaultIcon(state)}
                tone={state.tone}
              />
              <AlertDialogHeader className='min-w-0 flex-1 space-y-1.5 pt-0.5 text-left'>
                <AlertDialogTitle className='text-base leading-6'>
                  {state.title}
                </AlertDialogTitle>
                {state.body ? (
                  <AlertDialogDescription className='whitespace-pre-line leading-relaxed'>
                    {state.body}
                  </AlertDialogDescription>
                ) : null}
                {state.type === "prompt" && (
                  <Input
                    className='mt-3'
                    defaultValue={state.defaultValue}
                    name='prompt'
                    {...state.inputProps}
                  />
                )}
              </AlertDialogHeader>
            </div>
            <AlertDialogFooter className='gap-2 border-t bg-muted/30 px-6 py-3 sm:space-x-0'>
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

const DialogIcon = ({
  icon: IconComponent,
  tone,
}: {
  icon: Icon;
  tone: DialogTone;
}) => (
  <div
    className={cn(
      "flex size-11 shrink-0 items-center justify-center rounded-xl border",
      tone === "destructive"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-primary/25 bg-primary/10 text-primary",
    )}>
    <IconComponent aria-hidden className='size-5' weight='duotone' />
  </div>
);

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
