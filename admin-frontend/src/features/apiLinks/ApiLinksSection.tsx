import { useI18n } from "../../i18n/useI18n";
import { Card } from "../../components/Card";

const LINKS = [
  { label: "Health", href: "/api/health" },
];

export function ApiLinksSection() {
  const { t } = useI18n();
  return (
    <Card title={<><span aria-hidden>🔗</span> {t.apiLinks.heading}</>}>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {LINKS.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm transition-all hover:-translate-y-0.5 hover:border-primary-500 hover:bg-primary-50/40 hover:shadow-sm"
            >
              <span className="font-semibold text-gray-700">
                ❤️ {t.apiLinks.health}
              </span>
              <span className="font-mono text-xs text-gray-500">{link.href}</span>
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
