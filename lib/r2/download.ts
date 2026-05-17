import { useAction } from 'convex/react';
import { useCallback } from 'react';
import { api } from '@/convex/_generated/api';

export function useR2Url() {
  const presign = useAction(api.r2.generatePresignedGetUrl);
  return useCallback(
    async (key: string): Promise<string> => {
      const { url } = await presign({ key });
      return url;
    },
    [presign],
  );
}
