import { useI18n } from "../../i18n/useI18n";
import { detectMediaKind } from "../../lib/mediaKind";
import type { InstanceMedia } from "../../types/api";

interface Props {
  media: InstanceMedia;
}

export function MediaPreview({ media }: Props) {
  const iconUrl = media.icon_url || "";
  const backgroundUrl = media.background_url || "";
  const iconKind = media.icon_kind || detectMediaKind(iconUrl);
  const backgroundKind = media.background_kind || detectMediaKind(backgroundUrl);

  return (
    <div className="relative h-28 overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-emerald-900/85 to-neutral-900/95">
      {backgroundUrl ? (
        backgroundKind === "video" ? (
          <video
            className="absolute inset-0 h-full w-full object-cover opacity-70"
            src={backgroundUrl}
            muted
            loop
            autoPlay
            playsInline
          />
        ) : (
          <img
            className="absolute inset-0 h-full w-full object-cover opacity-70"
            src={backgroundUrl}
            alt=""
            loading="lazy"
          />
        )
      ) : null}
      <div className="relative z-10 grid h-full place-items-center">
        {iconUrl ? (
          iconKind === "video" ? (
            <video
              className="h-14 w-14 rounded-xl object-cover"
              src={iconUrl}
              muted
              loop
              autoPlay
              playsInline
            />
          ) : (
            <img
              className="h-14 w-14 rounded-xl object-cover"
              src={iconUrl}
              alt=""
              loading="lazy"
            />
          )
        ) : (
          <span className="text-3xl">🎮</span>
        )}
      </div>
    </div>
  );
}

export function MediaSummary({ media }: Props) {
  const { t } = useI18n();
  return (
    <p className="text-xs text-gray-500">
      Icon: {media.icon_url ? t.instances.mediaConfigured : t.instances.mediaMissing}
      {" · "}
      Background: {media.background_url ? t.instances.mediaConfigured : t.instances.mediaMissing}
    </p>
  );
}
