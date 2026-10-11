import { Modal } from "@nexusmods/vortex-api";
import * as React from "react";
import { Button } from "react-bootstrap";
import { useTranslation } from "react-i18next";

import { NS } from "../constants";
import type { RestorePrompt } from "../util/restorePrompt";

interface IRestoreFilesDialogProps {
  visible: boolean;
  prompt: RestorePrompt;
}

// The file list scrolls on its own, so the text and the selection links stay in view.
const FILE_LIST_STYLE: React.CSSProperties = {
  maxHeight: "50vh",
  overflowY: "auto",
  border: "1px solid rgba(128, 128, 128, 0.4)",
  borderRadius: 4,
  padding: "4px 8px",
};
const FILE_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  margin: "4px 0",
  fontWeight: "normal",
  wordBreak: "break-all",
};
const SELECTION_LINKS_STYLE: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: 12, margin: "8px 0" };

/** Asks which of the files a verification found differing to restore. */
export default function RestoreFilesDialog({ visible, prompt }: IRestoreFilesDialogProps) {
  const request = prompt.pending;
  return (
    <Modal show={visible && request !== undefined} onHide={() => prompt.cancel()}>
      {request !== undefined ? (
        <FileSelection files={request.files} key={request.requestId} onAnswer={(selected) => prompt.answer(selected)} />
      ) : null}
    </Modal>
  );
}

interface IFileSelectionProps {
  files: string[];
  onAnswer: (selected: string[]) => void;
}

function FileSelection({ files, onAnswer }: IFileSelectionProps) {
  const { t } = useTranslation([NS, "common"]);
  const [deselected, setDeselected] = React.useState<ReadonlySet<string>>(new Set());
  const selected = files.filter((filePath) => !deselected.has(filePath));

  const toggle = (filePath: string) =>
    setDeselected((previous) => {
      const next = new Set(previous);
      if (!next.delete(filePath)) {
        next.add(filePath);
      }
      return next;
    });

  return (
    <>
      <Modal.Header>
        <Modal.Title>{t("Steam detected mismatched files")}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          {t(
            "Steam file integrity verification has detected that the following original game files have either " +
              "been altered or are missing. Select the files you would like to restore:",
          )}
        </p>
        <div style={SELECTION_LINKS_STYLE}>
          <span>{t("{{selected}} of {{count}} selected", { selected: selected.length, count: files.length })}</span>
          <a onClick={() => setDeselected(new Set())}>{t("Select all")}</a>
          <a onClick={() => setDeselected(new Set(files))}>{t("Select none")}</a>
        </div>
        <div style={FILE_LIST_STYLE}>
          {files.map((filePath) => (
            <label key={filePath} style={FILE_STYLE}>
              <input checked={!deselected.has(filePath)} type="checkbox" onChange={() => toggle(filePath)} />
              <span>{filePath}</span>
            </label>
          ))}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={() => onAnswer([])}>{t("Cancel")}</Button>
        <Button bsStyle="primary" disabled={selected.length === 0} onClick={() => onAnswer(selected)}>
          {t("Download and Replace Game Files")}
        </Button>
      </Modal.Footer>
    </>
  );
}
