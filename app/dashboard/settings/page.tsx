'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'convex/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/convex/_generated/api';
import {
  type ProfileFormInput,
  profileFormSchema,
} from '@/convex/schemas/profile';
import { useMe } from '../me-context';

export default function SettingsPage() {
  const me = useMe();
  const updateProfile = useMutation(api.users.updateProfile);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const form = useForm<ProfileFormInput>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: me?.displayName ?? '',
      bio: me?.bio ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await updateProfile({
        displayName: values.displayName,
        bio: values.bio ?? '',
      });
      setSavedAt(Date.now());
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to save profile.',
      );
    }
  });

  if (me === null) {
    return (
      <main className="p-8">
        <p className="text-sm text-muted-foreground">
          Your account row hasn't synced yet. Try again in a moment.
        </p>
      </main>
    );
  }

  return (
    <main className="p-8">
      <div className="w-full max-w-md">
        <h1 className="mb-6 text-2xl font-bold">Settings</h1>
        <Form {...form}>
          <form onSubmit={onSubmit} className="grid gap-4">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="nickname"
                      placeholder="Jane Doe"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bio</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="A short bio (optional)"
                      rows={4}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {submitError ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {submitError}
              </p>
            ) : null}
            {savedAt && !submitError ? (
              <p
                role="status"
                className="text-sm font-medium text-muted-foreground"
              >
                Saved
              </p>
            ) : null}
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </Form>
      </div>
    </main>
  );
}
