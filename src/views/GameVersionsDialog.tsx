import { Modal, selectors } from "@nexusmods/vortex-api";
import * as React from "react";
import { Button, ControlLabel, FormControl, FormGroup, Label, Table } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector, useStore } from "react-redux";

import { userVersionAdded, userVersionChanged, userVersionRemoved } from "../actions/persistent";
import { isInstalledVersion, listGameVersions, validateUserVersion } from "../catalog/catalog";
import { readGameManifests } from "../catalog/gameVersions";
import { parseDepotLines } from "../catalog/parse";
import { IGameVersion, IListedVersion, VersionSource } from "../catalog/types";
import { NS } from "../constants";
import { builtInCatalog, steamAppIdFor, userVersions } from "../selectors";
import { logError } from "../util/errors";

interface IGameVersionsDialogProps {
  visible: boolean;
  onHide: () => void;
  /** Asks the user to confirm, then puts the game at the version. */
  onInstall: (gameId: string, versionId: string) => void;
}

/** The user version being edited; a new one when there is no initial version. */
interface IEditing {
  initial: IGameVersion | undefined;
}

export default function GameVersionsDialog({ visible, onHide, onInstall }: IGameVersionsDialogProps) {
  const { t } = useTranslation([NS, "common"]);
  const dispatch = useDispatch();
  const store = useStore();
  const gameId: string = useSelector(selectors.activeGameId);
  const builtIn = useSelector(builtInCatalog);
  const users = useSelector(userVersions);
  const steamAppId = useSelector((state) => steamAppIdFor(state, gameId));
  const [editing, setEditing] = React.useState<IEditing | undefined>(undefined);
  // keyed by depot id; read each time the dialog opens
  const [installedManifests, setInstalledManifests] = React.useState<
    ReadonlyMap<number, string> | undefined
  >(undefined);

  React.useEffect(() => {
    if (!visible) {
      return undefined;
    }
    let current = true;
    readGameManifests(store.getState(), gameId).then(
      (manifests) => {
        if (current) {
          setInstalledManifests(manifests);
        }
      },
      (err) => logError("Failed to read the installed game version", err),
    );
    return () => {
      current = false;
      setInstalledManifests(undefined);
    };
  }, [visible, gameId]);

  const versions = React.useMemo(
    () => listGameVersions(builtIn, users, gameId),
    [builtIn, users, gameId],
  );
  const editedId = editing?.initial?.id;

  const save = (version: IGameVersion) => {
    dispatch(
      editedId === undefined
        ? userVersionAdded(gameId, version)
        : userVersionChanged(gameId, editedId, version),
    );
    setEditing(undefined);
  };

  return (
    <Modal show={visible} onHide={onHide}>
      <Modal.Header>
        <Modal.Title>{t("Game Versions")}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {editing === undefined ? (
          <VersionList
            installedManifests={installedManifests}
            versions={versions}
            onInstall={(versionId) => onInstall(gameId, versionId)}
            onEdit={(version) => setEditing({ initial: version })}
            onRemove={(versionId) => dispatch(userVersionRemoved(gameId, versionId))}
          />
        ) : (
          <VersionEditor
            initial={editing.initial}
            steamAppId={steamAppId}
            validate={(version) => validateUserVersion(versions, version, editedId)}
            onSave={save}
            onCancel={() => setEditing(undefined)}
          />
        )}
      </Modal.Body>
      <Modal.Footer>
        {editing === undefined ? (
          <Button onClick={() => setEditing({ initial: undefined })}>
            {t("Add Version")}
          </Button>
        ) : null}
        <Button onClick={onHide}>{t("Close")}</Button>
      </Modal.Footer>
    </Modal>
  );
}

interface IVersionListProps {
  versions: IListedVersion[];
  /** The game's installed depots and their manifests, keyed by depot id; undefined until read. */
  installedManifests: ReadonlyMap<number, string> | undefined;
  onInstall: (versionId: string) => void;
  onEdit: (version: IGameVersion) => void;
  onRemove: (versionId: string) => void;
}

function VersionList({ versions, installedManifests, onInstall, onEdit, onRemove }: IVersionListProps) {
  const { t } = useTranslation([NS, "common"]);
  if (versions.length === 0) {
    return <p>{t("No versions of this game are known yet. Add one with its Steam depots.")}</p>;
  }
  return (
    <Table>
      <thead>
        <tr>
          <th>{t("Version")}</th>
          <th>{t("Depots")}</th>
          <th>{t("Source")}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {versions.map(({ source, version }) => {
          const installed =
            installedManifests !== undefined && isInstalledVersion(version, installedManifests);
          return (
            <tr key={`${source}:${version.id}`}>
              <td>
                {version.label}{" "}
                {installed ? <Label bsStyle="success">{t("Installed")}</Label> : null}
              </td>
              <td>{version.depots.length}</td>
              <td>{source === VersionSource.BuiltIn ? t("Built-in") : t("Yours")}</td>
              <td>
                <Button disabled={installed} onClick={() => onInstall(version.id)}>
                  {t("Install")}
                </Button>
                {source === VersionSource.User ? (
                  <>
                    <Button onClick={() => onEdit(version)}>{t("Edit")}</Button>
                    <Button onClick={() => onRemove(version.id)}>{t("Remove")}</Button>
                  </>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

interface IVersionEditorProps {
  initial: IGameVersion | undefined;
  steamAppId: number | undefined;
  /** Why the version cannot be saved, if it cannot. */
  validate: (version: IGameVersion) => string[];
  onSave: (version: IGameVersion) => void;
  onCancel: () => void;
}

const depotLines = (version: IGameVersion | undefined): string =>
  (version?.depots ?? []).map((depot) => `${depot.depotId} ${depot.manifestId}`).join("\n");

function VersionEditor({ initial, steamAppId, validate, onSave, onCancel }: IVersionEditorProps) {
  const { t } = useTranslation([NS, "common"]);
  const [name, setName] = React.useState(initial?.id ?? "");
  const [depotsText, setDepotsText] = React.useState(depotLines(initial));
  const [problems, setProblems] = React.useState<string[]>([]);

  const save = () => {
    const parsed = parseDepotLines(depotsText, steamAppId);
    const version: IGameVersion = {
      ...initial,
      id: name.trim(),
      label: name.trim(),
      depots: parsed.depots,
    };
    const found = [...parsed.problems, ...validate(version)];
    if (found.length > 0) {
      setProblems(found);
    } else {
      onSave(version);
    }
  };

  return (
    <div>
      <FormGroup>
        <ControlLabel>{t("Version")}</ControlLabel>
        <FormControl
          type="text"
          value={name}
          placeholder={t("e.g. 1.5.97")}
          onChange={(evt) => setName((evt.target as HTMLInputElement).value)}
        />
      </FormGroup>
      <FormGroup>
        <ControlLabel>{t("Depots")}</ControlLabel>
        <FormControl
          componentClass="textarea"
          rows={6}
          value={depotsText}
          placeholder={t(
            "One per line: <depot id> <manifest id>, or a download_depot command from a downgrade guide",
          )}
          onChange={(evt) => setDepotsText((evt.target as HTMLTextAreaElement).value)}
        />
      </FormGroup>
      {problems.length > 0 ? (
        <ul>
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      <Button onClick={onCancel}>{t("Cancel")}</Button>
      <Button onClick={save}>{t("Save")}</Button>
    </div>
  );
}
