import type * as React from 'react';
import { cn } from '@/shared/lib/utils';

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-stone-200 bg-white text-stone-950 shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return <div className={cn('p-6 pb-3', className)} {...props} />;
}

export function CardContent({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return <div className={cn('p-6 pt-3', className)} {...props} />;
}
