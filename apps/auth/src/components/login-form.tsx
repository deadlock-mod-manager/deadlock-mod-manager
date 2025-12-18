import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Form,
  FormControl,
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
import { type LoginFormData, loginSchema } from "../lib/validation";

interface LoginFormProps {
  callbackURL?: string;
  error?: string;
}

export function LoginForm({ callbackURL, error }: LoginFormProps) {
  const router = useRouter();
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const payload: Record<string, string> = {
        email: data.email,
        password: data.password,
      };

      if (callbackURL) {
        payload.callbackURL = callbackURL;
      }

      const response = await fetch("/api/auth/sign-in/email", {
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

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const displayError =
    error ||
    (loginMutation.error instanceof Error ? loginMutation.error.message : null);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
        {displayError && (
          <Alert variant='destructive'>
            <AlertDescription>{displayError}</AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email address</FormLabel>
              <FormControl>
                <Input
                  type='email'
                  placeholder='you@example.com'
                  autoComplete='email'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type='password'
                  placeholder='Your password'
                  autoComplete='current-password'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type='submit'
          disabled={loginMutation.isPending}
          className='w-full'>
          {loginMutation.isPending ? "Please wait..." : "Sign In"}
        </Button>
      </form>
    </Form>
  );
}
