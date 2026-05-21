"use client";

import { Loader2, Sparkles } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { postHebbFieldSuggest, type HebbFieldSuggestResult } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { isHebbFieldSensitive, stripSensitiveFromPartialForm } from "@/lib/hebb-field-sensitivity";

export type HebbFieldAssistContextValue = {
  formId: string;
  partialForm?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

const HebbFieldAssistCtx = createContext<HebbFieldAssistContextValue | null>(null);

export function HebbFieldAssistProvider({
  formId,
  partialForm,
  context,
  children
}: HebbFieldAssistContextValue & { children: ReactNode }): React.JSX.Element {
  const value = useMemo(
    () => ({
      formId,
      partialForm: stripSensitiveFromPartialForm(partialForm),
      context: stripSensitiveFromPartialForm(context)
    }),
    [formId, partialForm, context]
  );
  return <HebbFieldAssistCtx.Provider value={value}>{children}</HebbFieldAssistCtx.Provider>;
}

export function useHebbFieldAssist(): HebbFieldAssistContextValue | null {
  return useContext(HebbFieldAssistCtx);
}

export type HebbFieldAssistButtonProps = {
  fieldKey: string;
  formId?: string;
  partialForm?: Record<string, unknown>;
  context?: Record<string, unknown>;
  disabled?: boolean;
  onSuggest: (result: HebbFieldSuggestResult) => void;
  className?: string;
};

export function HebbFieldAssistButton({
  fieldKey,
  formId: formIdProp,
  partialForm: partialProp,
  context: contextProp,
  disabled,
  onSuggest,
  className
}: HebbFieldAssistButtonProps): React.JSX.Element {
  const ctx = useHebbFieldAssist();
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const blocked = isHebbFieldSensitive(fieldKey);
  const tooltipId = useId();

  const formId = formIdProp ?? ctx?.formId ?? "";
  const partialForm = stripSensitiveFromPartialForm(partialProp ?? ctx?.partialForm);
  const context = stripSensitiveFromPartialForm(contextProp ?? ctx?.context);

  const run = useCallback(async (): Promise<void> => {
    if (blocked || !formId) return;
    const token = getToken();
    if (!token) {
      setHint("Accedi per usare HEBB.");
      return;
    }
    setLoading(true);
    setHint(null);
    try {
      const res = await postHebbFieldSuggest(token, {
        fieldKey,
        formId,
        partialForm,
        context
      });
      if (res.source === "blocked" || res.value === null || res.value === "") {
        setHint(res.reason);
        return;
      }
      onSuggest(res);
      setHint(res.reason);
    } catch (e) {
      setHint(e instanceof Error ? e.message : "Suggerimento non disponibile");
    } finally {
      setLoading(false);
    }
  }, [blocked, formId, fieldKey, partialForm, context, onSuggest]);

  return (
    <span className={`inline-flex flex-col items-end gap-0.5 ${className ?? ""}`}>
      <button
        type="button"
        disabled={disabled || loading || blocked || !formId}
        title={blocked ? "Campo sensibile — autofill disabilitato (GDPR)" : "Compila con HEBB"}
        aria-label={blocked ? "Autofill disabilitato per campo sensibile" : "Compila con HEBB"}
        aria-describedby={hint ? tooltipId : undefined}
        onClick={() => void run()}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${
          blocked
            ? "cursor-not-allowed border-slate-300/50 text-slate-400 opacity-50 dark:border-white/10"
            : "border-violet-400/45 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 dark:border-violet-400/35 dark:text-violet-200"
        }`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="h-4 w-4" aria-hidden />
        )}
      </button>
      {hint ? (
        <span id={tooltipId} className="max-w-[14rem] text-right text-[10px] leading-tight text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      ) : null}
    </span>
  );
}

/** Wrapper riga label + controllo + icona Hebb. */
export function HebbFieldRow({
  label,
  fieldKey,
  formId,
  partialForm,
  context,
  onSuggest,
  children,
  className
}: {
  label: ReactNode;
  fieldKey: string;
  formId?: string;
  partialForm?: Record<string, unknown>;
  context?: Record<string, unknown>;
  onSuggest: (result: HebbFieldSuggestResult) => void;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <label className={`block text-sm ${className ?? ""}`}>
      <span className="flex items-center justify-between gap-2 text-synapse-muted dark:text-[#b4c9dc]">
        <span>{label}</span>
        <HebbFieldAssistButton
          fieldKey={fieldKey}
          formId={formId}
          partialForm={partialForm}
          context={context}
          onSuggest={onSuggest}
        />
      </span>
      <div className="mt-1 flex gap-2">
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </label>
  );
}

export type HebbInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  label: ReactNode;
  fieldKey: string;
  formId?: string;
  value: string;
  onChange: (value: string) => void;
  partialForm?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export function HebbInput({
  label,
  fieldKey,
  formId,
  value,
  onChange,
  partialForm,
  context,
  className,
  ...inputProps
}: HebbInputProps): React.JSX.Element {
  return (
    <HebbFieldRow
      label={label}
      fieldKey={fieldKey}
      formId={formId}
      partialForm={partialForm}
      context={context}
      onSuggest={(res) => onChange(String(res.value ?? ""))}
    >
      <input
        {...inputProps}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={
          className ??
          "w-full rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm dark:bg-[#052642]"
        }
      />
    </HebbFieldRow>
  );
}

export type HebbTextareaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  label: ReactNode;
  fieldKey: string;
  formId?: string;
  value: string;
  onChange: (value: string) => void;
  partialForm?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export function HebbTextarea({
  label,
  fieldKey,
  formId,
  value,
  onChange,
  partialForm,
  context,
  className,
  ...props
}: HebbTextareaProps): React.JSX.Element {
  return (
    <HebbFieldRow
      label={label}
      fieldKey={fieldKey}
      formId={formId}
      partialForm={partialForm}
      context={context}
      onSuggest={(res) => onChange(String(res.value ?? ""))}
    >
      <textarea
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={
          className ??
          "min-h-[90px] w-full resize-y rounded-lg border border-slate-300/90 bg-white/90 p-3 text-sm dark:border-white/15 dark:bg-[#052642]/90 dark:text-white"
        }
      />
    </HebbFieldRow>
  );
}

export type HebbSelectProps = {
  label: ReactNode;
  fieldKey: string;
  formId?: string;
  value: string;
  onChange: (value: string) => void;
  partialForm?: Record<string, unknown>;
  context?: Record<string, unknown>;
  children: ReactNode;
  className?: string;
  required?: boolean;
};

export function HebbSelect({
  label,
  fieldKey,
  formId,
  value,
  onChange,
  partialForm,
  context,
  children,
  className,
  required
}: HebbSelectProps): React.JSX.Element {
  return (
    <HebbFieldRow
      label={label}
      fieldKey={fieldKey}
      formId={formId}
      partialForm={partialForm}
      context={context}
      onSuggest={(res) => onChange(String(res.value ?? ""))}
    >
      <select
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className={
          className ??
          "w-full rounded-lg border border-[var(--prom-line)] bg-transparent px-3 py-2"
        }
      >
        {children}
      </select>
    </HebbFieldRow>
  );
}

/** HOC per avvolgere sezioni form con provider Hebb. */
export function withHebbAssist<P extends object>(
  Wrapped: React.ComponentType<P>,
  options: { formId: string; getPartialForm?: (props: P) => Record<string, unknown>; getContext?: (props: P) => Record<string, unknown> }
): React.ComponentType<P> {
  function WithHebbAssist(props: P): React.JSX.Element {
    const partialForm = options.getPartialForm?.(props);
    const context = options.getContext?.(props);
    return (
      <HebbFieldAssistProvider formId={options.formId} partialForm={partialForm} context={context}>
        <Wrapped {...props} />
      </HebbFieldAssistProvider>
    );
  }
  WithHebbAssist.displayName = `WithHebbAssist(${Wrapped.displayName ?? Wrapped.name ?? "Component"})`;
  return WithHebbAssist;
}
