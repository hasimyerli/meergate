'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function RunsRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const testId = searchParams.get('test_id');

  useEffect(() => {
    const target = testId ? `/tests?tab=runs&test_id=${testId}` : '/tests?tab=runs';
    router.replace(target);
  }, [router, testId]);

  return (
    <div className="flex items-center justify-center py-32">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-indigo-600" />
    </div>
  );
}
