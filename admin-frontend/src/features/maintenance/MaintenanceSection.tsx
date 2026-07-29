import { useEffect, useState } from "react";
import { Save, ShieldAlert, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { useAlert } from "../../components/useAlert";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { useConfirm } from "../../components/useConfirm";
import { Spinner } from "../../components/Spinner";
import { Switch } from "../../components/Switch";
import { useI18n } from "../../i18n/useI18n";
import {
  useAddWhitelistEntry,
  useMaintenanceStatus,
  useRemoveWhitelistEntry,
  useToggleMaintenance,
  useUpdateMaintenance,
  useWhitelist,
} from "./useMaintenance";

const ADMIN_NICK_KEY = "mrpack_admin_minecraft_nick";
const NICK_PATTERN = /^[a-zA-Z0-9_]{3,16}$/;

export function MaintenanceSection() {
  const { t } = useI18n();
  const { showAlert } = useAlert();
  const { confirm } = useConfirm();
  const statusQuery = useMaintenanceStatus();
  const whitelistQuery = useWhitelist();
  const toggleMutation = useToggleMaintenance();
  const updateMutation = useUpdateMaintenance();
  const addMutation = useAddWhitelistEntry();
  const removeMutation = useRemoveWhitelistEntry();
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [message, setMessage] = useState("");
  const [nick, setNick] = useState("");
  const [adminNick, setAdminNick] = useState(() => sessionStorage.getItem(ADMIN_NICK_KEY) || "");

  useEffect(() => {
    if (!statusQuery.data) return;
    setPremiumOnly(statusQuery.data.premiumOnly);
    setMessage(statusQuery.data.message);
  }, [statusQuery.data]);

  const handleToggle = async () => {
    const enabling = !statusQuery.data?.enabled;
    try {
      const cleanAdminNick = adminNick.trim();
      if (cleanAdminNick && !NICK_PATTERN.test(cleanAdminNick)) {
        showAlert(t.maintenance.invalidNick, "error");
        return;
      }
      if (cleanAdminNick) sessionStorage.setItem(ADMIN_NICK_KEY, cleanAdminNick);
      else sessionStorage.removeItem(ADMIN_NICK_KEY);

      if (enabling && cleanAdminNick) await addMutation.mutateAsync(cleanAdminNick);
      await toggleMutation.mutateAsync();
      showAlert(enabling ? t.maintenance.toggledOn : t.maintenance.toggledOff, "success");
    } catch (error) {
      showAlert(error instanceof Error ? error.message : t.errors.generic, "error");
    }
  };

  const handleSave = () => {
    if (!message.trim()) {
      showAlert(t.maintenance.messageHint, "error");
      return;
    }
    updateMutation.mutate(
      { premiumOnly, message: message.trim() },
      {
        onSuccess: () => showAlert(t.maintenance.saved, "success"),
        onError: (error: Error) => showAlert(error.message, "error"),
      },
    );
  };

  const handleAdd = () => {
    const cleanNick = nick.trim();
    if (!NICK_PATTERN.test(cleanNick)) {
      showAlert(t.maintenance.invalidNick, "error");
      return;
    }
    addMutation.mutate(cleanNick, {
      onSuccess: () => {
        setNick("");
        showAlert(t.maintenance.added(cleanNick), "success");
      },
      onError: (error: Error) => showAlert(error.message, "error"),
    });
  };

  const handleRemove = async (entry: string) => {
    if (!(await confirm(t.maintenance.removeConfirm(entry)))) return;
    removeMutation.mutate(entry, {
      onSuccess: () => showAlert(t.maintenance.removed(entry), "success"),
      onError: (error: Error) => showAlert(error.message, "error"),
    });
  };

  if (statusQuery.isLoading || whitelistQuery.isLoading) {
    return <LoadingPanel label={t.common.loading} />;
  }

  if (statusQuery.isError || whitelistQuery.isError) {
    const error = statusQuery.error || whitelistQuery.error;
    return <ErrorPanel message={error instanceof Error ? error.message : t.errors.generic} />;
  }

  const enabled = statusQuery.data?.enabled === true;
  const whitelist = whitelistQuery.data ?? [];

  return (
    <div className="space-y-5">
      <section
        className={[
          "flex flex-col justify-between gap-5 rounded-lg border p-5 sm:flex-row sm:items-center",
          enabled ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white",
        ].join(" ")}
      >
        <div className="flex items-start gap-4">
          <span className={[
            "grid h-11 w-11 shrink-0 place-items-center rounded-md",
            enabled ? "bg-amber-500 text-white" : "bg-emerald-50 text-emerald-700",
          ].join(" ")}>
            {enabled ? <ShieldAlert size={22} /> : <ShieldCheck size={22} />}
          </span>
          <div>
            <h2 className="text-base font-semibold text-gray-950">
              {enabled ? t.maintenance.enabled : t.maintenance.disabled}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">{t.maintenance.toggleHint}</p>
          </div>
        </div>
        <Switch
          size="md"
          tone="amber"
          checked={enabled}
          onCheckedChange={() => handleToggle()}
          disabled={toggleMutation.isPending || addMutation.isPending}
          aria-label={enabled ? t.maintenance.enabled : t.maintenance.disabled}
        />
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="rounded-lg border border-gray-200 bg-white">
          <header className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-950">{t.maintenance.heading}</h2>
            <p className="mt-1 text-sm text-gray-500">{t.maintenance.description}</p>
          </header>
          <div className="space-y-6 p-5">
            <Switch
              size="sm"
              label={t.maintenance.premiumOnly}
              description={t.maintenance.premiumOnlyHint}
              checked={premiumOnly}
              onCheckedChange={setPremiumOnly}
            />

            <div>
              <label htmlFor="maintenance-message" className="text-sm font-semibold text-gray-800">
                {t.maintenance.message}
              </label>
              <p className="mt-1 text-xs text-gray-500">{t.maintenance.messageHint}</p>
              <textarea
                id="maintenance-message"
                rows={5}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="mt-3 w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm leading-6 text-gray-800 placeholder:text-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label htmlFor="admin-nick" className="text-sm font-semibold text-gray-800">
                {t.maintenance.yourNick}
              </label>
              <p className="mt-1 text-xs text-gray-500">{t.maintenance.yourNickHint}</p>
              <Input
                id="admin-nick"
                value={adminNick}
                maxLength={16}
                onChange={(event) => setAdminNick(event.target.value)}
                className="mt-3"
                placeholder={t.maintenance.nickPlaceholder}
              />
            </div>

            <Button
              variant="primary"
              onClick={handleSave}
              loading={updateMutation.isPending}
              icon={<Save size={16} />}
            >
              {t.maintenance.save}
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white">
          <header className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-sky-50 text-sky-700">
              <Users size={18} />
            </span>
            <div>
              <h2 className="font-semibold text-gray-950">{t.maintenance.whitelist}</h2>
              <p className="mt-1 text-xs leading-5 text-gray-500">{t.maintenance.whitelistHint}</p>
            </div>
          </header>
          <div className="p-5">
            <div className="flex gap-2">
              <Input
                value={nick}
                maxLength={16}
                placeholder={t.maintenance.nickPlaceholder}
                onChange={(event) => setNick(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleAdd()}
              />
              <Button
                variant="secondary"
                onClick={handleAdd}
                loading={addMutation.isPending}
                icon={<UserPlus size={16} />}
              >
                {t.maintenance.add}
              </Button>
            </div>

            <div className="mt-5 divide-y divide-gray-100 border-y border-gray-100">
              {whitelist.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-500">{t.maintenance.empty}</p>
              ) : whitelist.map((entry) => (
                <div key={entry} className="flex h-12 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gray-100 text-xs font-bold uppercase text-gray-600">
                      {entry.charAt(0)}
                    </span>
                    <code className="truncate text-sm font-semibold text-gray-800">{entry}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(entry)}
                    disabled={removeMutation.isPending}
                    title={t.common.delete}
                    className="grid h-8 w-8 place-items-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-500">
      <Spinner /> {label}
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
      {message}
    </div>
  );
}
