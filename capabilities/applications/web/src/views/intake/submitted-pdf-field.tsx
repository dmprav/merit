import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { intakeLimits, type ApplicationPdf } from "@merit/applications/domain";
import { ActionMenu } from "@merit/ui/action-menu";
import { Button } from "@merit/ui/button";
import { Inline, Reading, Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { Text } from "@merit/ui/text";

import { samplePdfKeys, type PdfUpload, type SamplePdf } from "../../contracts/pdf-upload";

type PdfFieldProps = {
  upload: PdfUpload;
  value: ApplicationPdf[] | undefined;
  onChange: (pdfs: ApplicationPdf[]) => void;
  onPendingChange: (pending: boolean) => void;
};

export const SubmittedPdfField = (props: PdfFieldProps) => {
  const { t } = useTranslation("applicationIntake");
  const { upload, value = [], onChange } = props;
  const { select, pending, errors } = usePdfSelection(props);
  const picker = { mode: upload.mode, pending, onSelect: select };
  return (
    <Stack gap={2} role="group" aria-label={t("pdfs.title")}>
      <Text variant="emphasis">{t("pdfs.title")}</Text>
      <Text variant="caption">{t("pdfs.hint")}</Text>
      {value.map((pdf) => (
        <Inline key={pdf.id}>
          <Reading prose={false}>{pdf.filename}</Reading>
          <PdfPicker {...picker} pdf={pdf} />
          <Button
            variant="quiet"
            isDisabled={pending}
            aria-label={t("pdfs.removeNamed", { name: pdf.filename })}
            onPress={() => onChange(value.filter((item) => item.id !== pdf.id))}
          >
            {t("pdfs.remove")}
          </Button>
        </Inline>
      ))}
      <Inline>
        <PdfPicker {...picker} />
      </Inline>
      {pending && <span role="status">{t("pdfs.uploading")}</span>}
      {errors.length > 0 && (
        <Notice tone="danger" appearance="inline" role="alert" as="ul">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </Notice>
      )}
    </Stack>
  );
};

const PdfPicker = ({
  mode,
  pdf,
  pending,
  onSelect,
}: {
  mode: PdfUpload["mode"];
  pdf?: ApplicationPdf;
  pending: boolean;
  onSelect: (sources: (File | SamplePdf)[], replaceId?: string) => Promise<void>;
}) => {
  const { t } = useTranslation("applicationIntake");
  const input = useRef<HTMLInputElement>(null);
  const label = pdf
    ? t("pdfs.replaceNamed", { name: pdf.filename })
    : t(mode === "samples" ? "pdfs.addSample" : "pdfs.add");
  const trigger = (
    <Button
      variant={pdf ? "quiet" : "secondary"}
      isDisabled={pending}
      aria-label={label}
      onPress={mode === "files" ? () => input.current?.click() : undefined}
    >
      {pdf ? t("pdfs.replace") : label}
    </Button>
  );
  if (mode === "samples") {
    return (
      <ActionMenu
        label={label}
        trigger={trigger}
        items={samplePdfKeys.map((key) => ({ id: key, label: t(`pdfs.samples.${key}`) }))}
        onAction={(id) => {
          const key = samplePdfKeys.find((sample) => sample === id);
          if (key) {
            void onSelect([key], pdf?.id);
          }
        }}
      />
    );
  }
  return (
    <>
      {trigger}
      <input
        hidden
        type="file"
        multiple={!pdf}
        ref={input}
        accept="application/pdf,.pdf"
        aria-label={label}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void onSelect(files, pdf?.id);
        }}
      />
    </>
  );
};

const usePdfSelection = ({ upload, value = [], onChange, onPendingChange }: PdfFieldProps) => {
  const { t } = useTranslation("applicationIntake");
  const active = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => () => active.current?.abort(), []);

  const select = async (sources: (File | SamplePdf)[], replaceId?: string) => {
    if (active.current || !sources.length) {
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    onPendingChange(true);
    setErrors([]);
    const problems = new Set<string>();
    let next = value;
    for (const source of sources) {
      if (!replaceId && next.length >= intakeLimits.pdfsCount) {
        problems.add(t("pdfs.limit"));
        break;
      }
      const name = typeof source === "string" ? t(`pdfs.samples.${source}`) : source.name;
      const result = await stagePdf(upload, source, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      if (result.status !== "ok") {
        problems.add(t(`pdfs.${result.status}`, { name }));
        continue;
      }
      next = replaceId
        ? next.map((pdf) => (pdf.id === replaceId ? result.pdf : pdf))
        : [...next, result.pdf];
      onChange(next);
    }
    active.current = null;
    setErrors([...problems]);
    setPending(false);
    onPendingChange(false);
  };

  return { select, pending, errors };
};

const stagePdf = async (upload: PdfUpload, source: File | SamplePdf, signal: AbortSignal) => {
  if (typeof source !== "string") {
    if (!source.name.toLowerCase().endsWith(".pdf")) {
      return { status: "invalid" } as const;
    }
    if (source.size > intakeLimits.pdfBytes) {
      return { status: "oversized" } as const;
    }
  }
  try {
    return await upload.stage(source, signal);
  } catch {
    return { status: "unavailable" } as const;
  }
};
