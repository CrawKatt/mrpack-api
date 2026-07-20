import { Box } from "lucide-react";
import { useI18n } from "../../i18n/useI18n";
import { detectMediaKind } from "../../lib/mediaKind";
import type { InstanceMedia } from "../../types/api";

export function MediaPreview({ media }: { media: InstanceMedia }) {
  const iconUrl = media.icon_url || "";
  const backgroundUrl = media.background_url || "";
  const iconKind = media.icon_kind || detectMediaKind(iconUrl);
  const backgroundKind = media.background_kind || detectMediaKind(backgroundUrl);

  return (
    <div className="relative h-32 overflow-hidden border-b border-gray-200 bg-[#17251e]">
      {backgroundUrl ? backgroundKind === "video" ? (
        <video className="absolute inset-0 h-full w-full object-cover opacity-75" src={backgroundUrl} muted loop autoPlay playsInline />
      ) : (
        <img className="absolute inset-0 h-full w-full object-cover opacity-75" src={backgroundUrl} alt="" loading="lazy" />
      ) : null}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-black/20" />
      <div className="absolute bottom-3 left-4 grid h-12 w-12 place-items-center overflow-hidden rounded-md border-2 border-white/70 bg-[#203329] text-emerald-300 shadow-md">
        {iconUrl ? iconKind === "video" ? (
          <video className="h-full w-full object-cover" src={iconUrl} muted loop autoPlay playsInline />
        ) : (
          <img className="h-full w-full object-cover" src={iconUrl} alt="" loading="lazy" />
        ) : <Box size={22} />}
      </div>
    </div>
  );
}

export function MediaSummary({ media }: { media: InstanceMedia }) {
  const { t } = useI18n();
  return (
    <div className="mt-3 flex gap-2 text-[10px] text-gray-400">
      <span>Icon: {media.icon_url ? t.instances.mediaConfigured : t.instances.mediaMissing}</span>
      <span aria-hidden="true">·</span>
      <span>Background: {media.background_url ? t.instances.mediaConfigured : t.instances.mediaMissing}</span>
    </div>
  );
}
