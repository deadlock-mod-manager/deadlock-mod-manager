import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deadlock-mods/ui/components/form";
import { Input } from "@deadlock-mods/ui/components/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { type SteamEmailFormData, steamEmailSchema } from "../lib/validation";
import { SteamIcon } from "./icons";

interface SteamLoginFormProps {
  callbackURL?: string;
  errorCallbackURL?: string;
  onBack: () => void;
}

export function SteamLoginForm({
  callbackURL,
  errorCallbackURL,
  onBack,
}: SteamLoginFormProps) {
  const router = useRouter();
  const form = useForm<SteamEmailFormData>({
    resolver: zodResolver(steamEmailSchema),
    defaultValues: {
      email: "",
    },
  });

  const steamMutation = useMutation({
    mutationFn: async (data: SteamEmailFormData) => {
      const payload: Record<string, string> = {
        email: data.email,
      };

      if (callbackURL) {
        payload.callbackURL = callbackURL;
      }

      if (errorCallbackURL) {
        payload.errorCallbackURL = errorCallbackURL;
      }

      const response = await fetch("/api/auth/sign-in/steam", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "include",
        redirect: "follow",
      });

      if (response.redirected) {
        window.location.href = response.url;
        return;
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "An error occurred");
      }

      if (result.redirect && result.url) {
        if (result.url.startsWith("http")) {
          window.location.href = result.url;
        } else {
          await router.navigate({ to: result.url });
        }
        return;
      }

      if (callbackURL) {
        if (callbackURL.startsWith("http")) {
          window.location.href = callbackURL;
        } else {
          await router.navigate({ to: callbackURL });
        }
        return;
      }

      await router.invalidate();
    },
  });

  const onSubmit = (data: SteamEmailFormData) => {
    steamMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='mt-4 space-y-3'>
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email address for Steam account</FormLabel>
              <FormControl>
                <Input
                  type='email'
                  placeholder='you@example.com'
                  autoComplete='email'
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Steam doesn't share your email, so we need it for your account.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {steamMutation.error && (
          <Alert variant='destructive'>
            <AlertDescription>
              {steamMutation.error instanceof Error
                ? steamMutation.error.message
                : "An error occurred"}
            </AlertDescription>
          </Alert>
        )}

        <div className='flex gap-2'>
          <Button
            type='button'
            variant='outline'
            onClick={onBack}
            className='flex-1'>
            Back
          </Button>
          <Button
            type='submit'
            disabled={steamMutation.isPending}
            className='flex-1'>
            <SteamIcon className='h-5 w-5' />
            {steamMutation.isPending ? "Please wait..." : "Continue"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
