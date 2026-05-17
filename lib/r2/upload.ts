import { useAction } from 'convex/react';
import { useCallback } from 'react';
import { api } from '@/convex/_generated/api';

export type UploadInput = {
  file: File | Blob;
  contentType?: string;
  key?: string;
};

export type UploadResult = {
  key: string;
  etag?: string;
};

type PresignFn = (args: {
  contentType: string;
  key?: string;
}) => Promise<{ url: string; key: string }>;

async function putToR2(
  presign: PresignFn,
  { file, contentType, key }: UploadInput,
): Promise<UploadResult> {
  const resolvedContentType =
    contentType ??
    ((file instanceof File ? file.type : '') || 'application/octet-stream');

  const presigned = await presign({ contentType: resolvedContentType, key });

  const response = await fetch(presigned.url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': resolvedContentType },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`R2 upload failed: ${response.status} ${text}`);
  }

  const etag =
    response.headers.get('etag') ?? response.headers.get('ETag') ?? undefined;

  return { key: presigned.key, etag };
}

export function useR2Upload() {
  const presign = useAction(api.r2.generatePresignedPutUrl);
  return useCallback(
    (input: UploadInput) => putToR2(presign, input),
    [presign],
  );
}
