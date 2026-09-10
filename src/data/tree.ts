export interface CompanyDef {
  id: string;
  title: string;
  short: string;
  description: string;
  logo?: string;
}

export interface SupportDef {
  id: string;
  title: string;
  description: string;
  who?: string;
  toWhom?: string;
  metrics?: string;
}

export interface RootDef {
  id: string;
  title: string;
  short: string;
  description: string;
  who?: string;
  toWhom?: string;
  metrics?: string;
  supports: SupportDef[];
}

export interface ValueDef {
  id: string;
  title: string;
  short: string;
  description: string;
  color: string;
  promises: RootDef[];
}

// НОВОЕ: интерфейс для общего обещания (инфраструктура)
export interface GeneralDef {
  id: string;
  title: string;
  short: string;
  description: string;
  who?: string;      // подразделение, которое даёт обещание
  toWhom?: string;   // внутренний клиент
  metrics?: string;  // метрика успешности
}

export interface TreeData {
  company: CompanyDef;
  values: ValueDef[];
  generalPromises?: GeneralDef[];  // НОВОЕ поле
  customPositions?: Record<string, { x: number; y: number }>;
}

export type Tier = "company" | "value" | "root" | "support";

export const TIER_LABEL: Record<Tier, string> = {
  company: "Ядро компании",
  value: "Ценность",
  root: "Корневое обещание",
  support: "Поддерживающее обещание",
};

export function getValueColor(index: number): string {
  const hue = (index * 137.508) % 360;
  return `hsl(${hue.toFixed(1)}, 70%, 58%)`;
}

export const COMPANY: CompanyDef = {
  id: "company-core",
  title: "Наша компания",
  short: "КОМПАНИЯ",
  description: "Ядро дерева обещаний — миссия и ценности компании.",
};

// НОВОЕ: Общие обещания (инфраструктура компании)
// Они не отображаются на графе, но видны при клике на ядро
export const GENERAL_PROMISES: GeneralDef[] = [
  {
    id: "g-salary",
    title: "Зарплата начисляется без ошибок",
    short: "Зарплата",
    description: "Сотрудники получают зарплату вовремя и без ошибок в начислениях",
    who: "Бухгалтерия",
    toWhom: "Все сотрудники",
    metrics: "0 ошибок в месяц",
  },
  {
    id: "g-it-uptime",
    title: "ИТ-системы работают 24/7",
    short: "ИТ 24/7",
    description: "Внутренние системы компании доступны круглосуточно",
    who: "DevOps",
    toWhom: "Все сотрудники",
    metrics: "Аптайм ≥ 99.9%",
  },
  {
    id: "g-legal",
    title: "Договоры согласовываются за 1 день",
    short: "Договоры",
    description: "Юридический отдел согласовывает документы в течение одного рабочего дня",
    who: "Юристы",
    toWhom: "Все подразделения",
    metrics: "Среднее время ≤ 24ч",
  },
  {
    id: "g-hr-onboarding",
    title: "Новые сотрудники выходят за 2 недели",
    short: "Найм",
    description: "HR обеспечивает быстрый выход новых сотрудников на работу",
    who: "HR",
    toWhom: "Все руководители",
    metrics: "Средний срок ≤ 14 дней",
  },
  {
    id: "g-office",
    title: "Офис всегда чистый и комфортный",
    short: "Офис",
    description: "Рабочее пространство поддерживается в чистоте и порядке",
    who: "АХО",
    toWhom: "Все сотрудники",
    metrics: "Уборка ежедневно",
  },
];

export const VALUES: ValueDef[] = [
  {
    id: "v-reliability",
    title: "Надёжность",
    short: "Надёжность",
    description: "Мы гарантируем стабильность и предсказуемость работы.",
    color: getValueColor(0),
    promises: [
      {
        id: "r-uptime",
        title: "Сервис доступен 24/7",
        short: "24/7",
        description: "Наши сервисы работают круглосуточно без перерывов.",
        who: "Инфраструктура",
        toWhom: "Все клиенты",
        metrics: "Аптайм ≥ 99.9%",
        supports: [
          { id: "s-monitoring", title: "Мониторинг в реальном времени", description: "Мониторинг в реальном времени", who: "DevOps", toWhom: "Инфраструктура", metrics: "Алерт за 1 мин" },
          { id: "s-backup", title: "Резервные копии каждые 6 часов", description: "Резервные копии каждые 6 часов", who: "DevOps", toWhom: "Клиенты", metrics: "RPO ≤ 6ч" },
        ],
      },
      {
        id: "r-stability",
        title: "Стабильность важнее новых функций",
        short: "Стабильность",
        description: "Приоритет — стабильная работа, а не новые фичи.",
        who: "Продукт",
        toWhom: "Клиенты",
        metrics: "NPS ≥ 60",
        supports: [
          { id: "s-regression", title: "Регрессионное тестирование", description: "Регрессионное тестирование", who: "QA", toWhom: "Продукт", metrics: "Покрытие ≥ 85%" },
        ],
      },
    ],
  },
  {
    id: "v-speed",
    title: "Скорость",
    short: "Скорость",
    description: "Мы отвечаем быстро и работаем эффективно.",
    color: getValueColor(1),
    promises: [
      {
        id: "r-response",
        title: "Ответ клиенту — в течение дня",
        short: "Быстрый ответ",
        description: "Каждый клиент получает ответ в течение рабочего дня.",
        who: "Поддержка",
        toWhom: "Клиенты",
        metrics: "Среднее время ответа ≤ 2ч",
        supports: [
          { id: "s-sla", title: "SLA на первый ответ", description: "SLA на первый ответ", who: "Поддержка", toWhom: "Клиенты", metrics: "≤ 2 часа" },
          { id: "s-templates", title: "Шаблоны ответов для типовых вопросов", description: "Шаблоны ответов", who: "Поддержка", toWhom: "Команда", metrics: "80% покрыто" },
        ],
      },
    ],
  },
  {
    id: "v-transparency",
    title: "Прозрачность",
    short: "Прозрачность",
    description: "Мы открыто говорим о проблемах, ценах и процессах.",
    color: getValueColor(2),
    promises: [
      {
        id: "r-pricing",
        title: "Честное ценообразование",
        short: "Честные цены",
        description: "Все цены прозрачны и зафиксированы.",
        who: "Продажи",
        toWhom: "Клиенты",
        metrics: "0 скрытых платежей",
        supports: [
          { id: "s-calculator", title: "Калькулятор стоимости на сайте", description: "Калькулятор стоимости", who: "Маркетинг", toWhom: "Клиенты", metrics: "Точность 100%" },
        ],
      },
    ],
  },
];
