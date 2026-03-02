/**
 * Dialog — Custom implementation using React createPortal.
 *
 * Radix Dialog's Portal relies on `@radix-ui/react-use-layout-effect`,
 * which evaluates `globalThis.document` at **module load time**.
 * In SSR-first environments (Remix + Vite), this can resolve to a no-op
 * on the client, causing the Portal to never mount.
 *
 * This implementation preserves the exact same API and CSS classes as
 * @axis-ds/ui-react Dialog, but portals via React.createPortal directly.
 */
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type HTMLAttributes,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "~/lib/utils/cn";

// ── Context ───────────────────────────────────────────────────────────

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DialogContext = createContext<DialogContextValue>({
  open: false,
  onOpenChange: () => {},
});

// ── Dialog (Root) ─────────────────────────────────────────────────────

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

function Dialog({ open = false, onOpenChange, children }: DialogProps) {
  const handleOpenChange = useCallback(
    (v: boolean) => onOpenChange?.(v),
    [onOpenChange],
  );
  return (
    <DialogContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
}

// ── DialogTrigger ─────────────────────────────────────────────────────

function DialogTrigger({ children }: { children: ReactNode }) {
  const { onOpenChange } = useContext(DialogContext);
  return (
    <button type="button" onClick={() => onOpenChange(true)}>
      {children}
    </button>
  );
}

// ── DialogContent (with Portal + Overlay) ─────────────────────────────

interface DialogContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, ...props }, ref) => {
    const { open, onOpenChange } = useContext(DialogContext);
    const contentRef = useRef<HTMLDivElement>(null);

    // Escape key handler
    useEffect(() => {
      if (!open) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") onOpenChange(false);
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open, onOpenChange]);

    // Focus trap — focus content on open
    useEffect(() => {
      if (!open || !contentRef.current) return;
      const el = contentRef.current;
      const prev = document.activeElement as HTMLElement | null;
      el.focus();
      return () => {
        prev?.focus?.();
      };
    }, [open]);

    // Prevent body scroll when open
    useEffect(() => {
      if (!open) return;
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }, [open]);

    if (!open || typeof document === "undefined") return null;

    const portal = (
      <div data-dialog-portal="">
        {/* Overlay */}
        <div
          className="fixed inset-0 z-50 bg-[var(--axis-dialog-overlay-bg)] animate-in fade-in-0"
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
        />
        {/* Content */}
        <div
          ref={(node) => {
            (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 shadow-lg duration-200",
            "bg-[var(--axis-dialog-content-bg)] border-[var(--axis-dialog-content-border)]",
            "animate-in fade-in-0 zoom-in-95 slide-in-from-left-1/2 slide-in-from-top-[48%]",
            "sm:rounded-lg",
            className,
          )}
          onClick={(e: MouseEvent) => e.stopPropagation()}
          {...props}
        >
          {/* Close button (X) */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Close"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          {children}
        </div>
      </div>
    );

    return createPortal(portal, document.body);
  },
);
DialogContent.displayName = "DialogContent";

// ── DialogClose ───────────────────────────────────────────────────────

interface DialogCloseProps {
  asChild?: boolean;
  children: ReactNode;
}

function DialogClose({ asChild, children }: DialogCloseProps) {
  const { onOpenChange } = useContext(DialogContext);

  if (asChild && children) {
    // Clone the child element and add onClick handler
    const child = children as React.ReactElement<{
      onClick?: (e: MouseEvent) => void;
    }>;
    return (
      <child.type
        {...child.props}
        onClick={(e: MouseEvent) => {
          child.props.onClick?.(e);
          onOpenChange(false);
        }}
      />
    );
  }

  return (
    <button type="button" onClick={() => onOpenChange(false)}>
      {children}
    </button>
  );
}

// ── Layout Components ─────────────────────────────────────────────────

const DialogHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

// ── Text Components ───────────────────────────────────────────────────

const DialogTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight text-[var(--axis-text-primary)]",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-[var(--axis-text-secondary)]", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

// ── Export ─────────────────────────────────────────────────────────────

export {
  Dialog,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
