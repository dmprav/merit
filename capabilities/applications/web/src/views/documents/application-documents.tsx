import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import type {
  ApplicationDocuments as DocumentSnapshot,
  DocumentCitation,
  DocumentSlot,
  DocumentVersion,
  SourceDocumentRole,
} from "@merit/applications/api";
import { Form, FormActions, FormDialog, FormTextField, useForm } from "@merit/forms";
import { Button } from "@merit/ui/button";
import { Notice } from "@merit/ui/notice";
import { TextField } from "@merit/ui/text-field";
import { Timestamp } from "@merit/ui/timestamp";

import type { ApplicationDocumentSession } from "../../contracts/documents";
import { useApplicationDocuments } from "../../controllers/documents/use-application-documents";
import styles from "./documents.module.css";

const roles: SourceDocumentRole[] = ["proposal", "budget"];

const emptyDocuments = (): DocumentSnapshot => ({
  proposal: { currentVersion: null, versions: [], citations: [] },
  budget: { currentVersion: null, versions: [], citations: [] },
});

type DocumentsModel = ReturnType<typeof useApplicationDocuments>;

const VersionMeta = ({ version }: { version: DocumentVersion }) => (
  <p className={styles.meta}>
    {version.recorder.name} <Timestamp value={version.recordedAt} />
  </p>
);

const CitationList = ({
  citations,
  kind,
  onOpen,
}: {
  citations: readonly DocumentCitation[];
  kind: string;
  onOpen: (citation: DocumentCitation) => void;
}) => {
  const { t } = useTranslation("applicationDocuments");
  if (citations.length === 0) {
    return null;
  }
  return (
    <ul>
      {citations.map((citation) => (
        <li key={citation.id} className={styles.citation}>
          {citation.note && <p className={styles.note}>{citation.note}</p>}
          <p>{t("place", { version: citation.version, page: citation.page })}</p>
          {citation.version !== citation.currentVersion && (
            <p>{t("currentVersion", { version: citation.currentVersion })}</p>
          )}
          <p className={styles.meta}>
            {citation.recorder.name} <Timestamp value={citation.recordedAt} />
          </p>
          <Button
            id={`view-page-${citation.id}`}
            variant="quiet"
            alignment="start"
            aria-label={t("viewCitation", {
              kind,
              version: citation.version,
              page: citation.page,
            })}
            onPress={() => onOpen(citation)}
          >
            {t("viewPage")}
          </Button>
        </li>
      ))}
    </ul>
  );
};

const EarlierVersions = ({
  role,
  kind,
  versions,
  onOpen,
}: {
  role: SourceDocumentRole;
  kind: string;
  versions: readonly DocumentVersion[];
  onOpen: (version: number, page: number, openerId: string) => void;
}) => {
  const { t } = useTranslation("applicationDocuments");
  if (versions.length === 0) {
    return null;
  }
  return (
    <div>
      <h4>{t("earlier")}</h4>
      <ul>
        {versions.map((version) => (
          <li key={version.version}>
            <p className={styles.version}>{t("version", { version: version.version })}</p>
            <VersionMeta version={version} />
            <Button
              id={`view-${role}-${version.version}`}
              variant="quiet"
              alignment="start"
              aria-label={t("viewVersion", { kind, version: version.version })}
              onPress={() => onOpen(version.version, 1, `view-${role}-${version.version}`)}
            >
              {t("view")}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const SlotView = ({
  role,
  slot,
  canWrite,
  pending,
  onAttach,
  onOpen,
}: {
  role: SourceDocumentRole;
  slot: DocumentSlot;
  canWrite: boolean;
  pending: boolean;
  onAttach: (file: File) => void;
  onOpen: (version: number, page: number, openerId: string) => void;
}) => {
  const { t } = useTranslation("applicationDocuments");
  const kind = t(role);
  const current = slot.versions[0];
  const earlier = slot.versions.slice(1);
  const fileName = role === "proposal" ? t("fileProposal") : t("fileBudget");
  return (
    <section className={styles.slot} aria-labelledby={`document-slot-${role}`}>
      <h3 id={`document-slot-${role}`}>{kind}</h3>
      {current ? (
        <div className={styles.facts}>
          <p>{current.filename}</p>
          <p className={styles.version}>{t("version", { version: current.version })}</p>
          <p className={styles.meta}>{t("pageCount", { count: current.pageCount })}</p>
          <VersionMeta version={current} />
        </div>
      ) : (
        <p>{role === "proposal" ? t("emptyProposal") : t("emptyBudget")}</p>
      )}
      <div className={styles.actions}>
        {current && (
          <Button
            id={`view-${role}-${current.version}`}
            variant="quiet"
            alignment="start"
            aria-label={t("viewVersion", { kind, version: current.version })}
            onPress={() => onOpen(current.version, 1, `view-${role}-${current.version}`)}
          >
            {t("view")}
          </Button>
        )}
        {canWrite && (
          <>
            <Button
              variant="secondary"
              isDisabled={pending}
              isPending={pending}
              onPress={() => document.getElementById(`document-file-${role}`)?.click()}
            >
              {current
                ? t("upload")
                : role === "proposal"
                  ? t("attachProposal")
                  : t("attachBudget")}
            </Button>
            <input
              id={`document-file-${role}`}
              className={styles.file}
              type="file"
              name={fileName}
              aria-label={fileName}
              accept="application/pdf"
              disabled={pending}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) {
                  onAttach(file);
                }
              }}
            />
          </>
        )}
      </div>
      <EarlierVersions role={role} kind={kind} versions={earlier} onOpen={onOpen} />
      <CitationList
        citations={slot.citations}
        kind={kind}
        onOpen={(citation) => onOpen(citation.version, citation.page, `view-page-${citation.id}`)}
      />
    </section>
  );
};

const ReferDialog = ({
  isOpen,
  onOpenChange,
  cite,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  cite: (note: string) => Promise<string | null>;
}) => {
  const { t } = useTranslation("applicationDocuments");
  const { form, submission } = useForm({
    defaultValues: { note: "" },
    schema: z.object({ note: z.string() }),
    onSubmit: async ({ note }) => cite(note),
    submitErrorMessage: t("saveFailed"),
  });
  return (
    <FormDialog
      title={t("refer")}
      closeLabel={t("close")}
      trigger={null}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissDisabled={submission.isSubmitting}
    >
      <Form
        label={t("refer")}
        submission={submission}
        actions={
          <FormActions
            submission={submission}
            onCancel={() => onOpenChange(false)}
            cancelLabel={t("cancel")}
            submitLabel={t("save")}
            submittingLabel={t("saving")}
          />
        }
      >
        <form.Field name="note">
          {(field) => <FormTextField field={field} label={t("note")} multiline rows={3} />}
        </form.Field>
      </Form>
    </FormDialog>
  );
};

const ReaderView = ({ model, canWrite }: { model: DocumentsModel; canWrite: boolean }) => {
  const { t } = useTranslation("applicationDocuments");
  const reader = model.reader!;
  const [referOpen, setReferOpen] = useState(false);
  const kind = t(reader.role);
  return (
    <div className={styles.reader}>
      <Button variant="quiet" alignment="start" onPress={model.closeReader}>
        {t("back")}
      </Button>
      <div className={styles.readerHeading}>
        <h2>{reader.filename}</h2>
        <span className={styles.version}>{t("version", { version: reader.version })}</span>
      </div>
      <div className={styles.pageControl}>
        <TextField
          className={styles.pageField}
          label={t("page")}
          value={String(reader.page)}
          onChange={model.setPage}
        />
        <Button
          variant="quiet"
          alignment="start"
          isDisabled={reader.page <= 1}
          onPress={() => model.setPage(String(reader.page - 1))}
        >
          {t("previous")}
        </Button>
        <Button
          variant="quiet"
          alignment="start"
          isDisabled={reader.page >= reader.pageCount}
          onPress={() => model.setPage(String(reader.page + 1))}
        >
          {t("next")}
        </Button>
        {canWrite && (
          <Button variant="secondary" onPress={() => setReferOpen(true)}>
            {t("refer")}
          </Button>
        )}
      </div>
      {/* A framed application response is blocked by frame-ancestors 'none'. */}
      <iframe
        key={reader.page}
        className={styles.frame}
        sandbox="allow-scripts"
        title={t("readerTitle", { kind, version: reader.version, page: reader.page })}
        src={`${reader.url}#page=${reader.page}`}
      />
      <CitationList
        citations={model.documents[reader.role].citations}
        kind={kind}
        onOpen={(citation) =>
          void model.openReader(
            citation.role,
            citation.version,
            citation.page,
            `view-page-${citation.id}`,
          )
        }
      />
      {canWrite && (
        <ReferDialog
          key={`${reader.role}-${reader.version}-${reader.page}-${referOpen}`}
          isOpen={referOpen}
          onOpenChange={setReferOpen}
          cite={async (note) => {
            const error = await model.cite(note);
            if (error === null) {
              setReferOpen(false);
            }
            return error;
          }}
        />
      )}
    </div>
  );
};

export const ApplicationDocuments = ({
  documents = emptyDocuments(),
  mode,
  canWrite,
  session,
  initialNotice = null,
  initialReader = null,
}: {
  documents?: DocumentSnapshot;
  mode: "manage" | "review";
  canWrite: boolean;
  session: ApplicationDocumentSession;
  initialNotice?: string | null;
  initialReader?: {
    role: SourceDocumentRole;
    version: number;
    page: number;
    filename: string;
    pageCount: number;
    bytes: Uint8Array;
  } | null;
}) => {
  const { t } = useTranslation("applicationDocuments");
  const model = useApplicationDocuments({ documents, session, initialNotice, initialReader });
  const writing = mode === "manage" && canWrite;
  const nothingAttached =
    model.documents.proposal.currentVersion === null &&
    model.documents.budget.currentVersion === null;
  return (
    <div className={styles.documents}>
      <div className={styles.heading}>
        <h2>{t("heading")}</h2>
      </div>
      {model.notice && (
        <Notice tone="danger" role="alert">
          {model.notice}
        </Notice>
      )}
      {model.reader ? (
        <ReaderView model={model} canWrite={writing} />
      ) : mode === "review" && nothingAttached ? (
        <p>{t("emptyReview")}</p>
      ) : (
        roles.map((role) => (
          <SlotView
            key={role}
            role={role}
            slot={model.documents[role]}
            canWrite={writing}
            pending={model.pendingRole === role}
            onAttach={(file) => void model.attachFile(role, file)}
            onOpen={(version, page, openerId) =>
              void model.openReader(role, version, page, openerId)
            }
          />
        ))
      )}
    </div>
  );
};
