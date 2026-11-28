import { createContext, use, useState, type ReactNode } from "react";

import type { ApplicationPdf } from "@merit/applications/domain";
import { Disclosure } from "@merit/ui/disclosure";

import styles from "./submitted-pdf-reference.module.css";

export type PdfReference = `pdf-${string}`;

const referenceKey = (id: string): PdfReference => `pdf-${id}`;

export const pdfReferenceItems = (pdfs: readonly ApplicationPdf[]) =>
  pdfs.map(({ id, filename }) => ({ id: referenceKey(id), label: filename }));

type PdfAddress = { applicationId: string } | { assignmentId: string };

export const ManagerPdfAddress = createContext<{
  workspaceSlug: string;
  applicationId: string;
} | null>(null);

const PdfViewer = ({
  pdf,
  workspaceSlug,
  address,
}: {
  pdf: ApplicationPdf;
  workspaceSlug: string;
  address: PdfAddress;
}) => {
  const query = new URLSearchParams({ id: pdf.id, ...address });
  const src = `/api/application-pdfs/${encodeURIComponent(workspaceSlug)}?${query}`;
  return (
    // eslint-disable-next-line react/iframe-missing-sandbox -- native PDF viewers require an unsandboxed frame; this endpoint serves authorized PDFs.
    <iframe className={styles.viewer} title={pdf.filename} src={src} />
  );
};

export const SnapshotPdfList = ({ pdfs }: { pdfs: readonly ApplicationPdf[] }) => {
  const target = use(ManagerPdfAddress);
  const [opened, setOpened] = useState<string | null>(null);
  return pdfs.map((pdf) =>
    target ? (
      <Disclosure
        key={pdf.id}
        title={pdf.filename}
        headingLevel={4}
        isExpanded={opened === pdf.id}
        onExpandedChange={(expanded) => setOpened(expanded ? pdf.id : null)}
      >
        {opened === pdf.id && (
          <PdfViewer
            pdf={pdf}
            workspaceSlug={target.workspaceSlug}
            address={{ applicationId: target.applicationId }}
          />
        )}
      </Disclosure>
    ) : (
      <p key={pdf.id}>{pdf.filename}</p>
    ),
  );
};

const PdfReferencePanel = ({
  pdf,
  workspaceSlug,
  address,
  active,
  heading,
}: {
  pdf: ApplicationPdf;
  workspaceSlug: string;
  address: PdfAddress;
  active: boolean;
  heading?: ReactNode;
}) => {
  // Fetch on the first visit, and keep the viewer mounted to retain its page and zoom.
  const [visited, setVisited] = useState(active);
  if (active && !visited) {
    setVisited(true);
  }
  return visited || active ? (
    <section aria-label={pdf.filename} hidden={!active}>
      {heading}
      <PdfViewer pdf={pdf} workspaceSlug={workspaceSlug} address={address} />
    </section>
  ) : null;
};

/** Leave each browser viewer mounted when switching so its page and zoom survive. */
export const SubmittedPdfReferences = ({
  pdfs,
  workspaceSlug,
  address,
  selected,
  heading,
}: {
  pdfs: readonly ApplicationPdf[];
  workspaceSlug: string;
  address: { applicationId: string } | { assignmentId: string };
  selected: string;
  heading?: (filename: string) => ReactNode;
}) =>
  pdfs.map((pdf) => (
    <PdfReferencePanel
      key={pdf.id}
      pdf={pdf}
      active={selected === referenceKey(pdf.id)}
      workspaceSlug={workspaceSlug}
      address={address}
      heading={heading?.(pdf.filename)}
    />
  ));
