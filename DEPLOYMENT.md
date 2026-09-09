# Размещение проекта на Vercel

## 📋 Что нужно для деплоя

✅ Аккаунт на [vercel.com](https://vercel.com) (бесплатный)  
✅ Git-репозиторий с проектом (GitHub, GitLab или Bitbucket)  
✅ Node.js 18+ на локальной машине  

---

## 🚀 Способ 1: Через веб-интерфейс Vercel (рекомендуется)

### Шаг 1: Загрузите проект в Git-репозиторий

```bash
# Инициализация git (если ещё не сделано)
git init

# Добавьте все файлы
git add .

# Создайте первый коммит
git commit -m "Initial commit: MAKC-tree-of-promises"

# Создайте репозиторий на GitHub/GitLab и добавьте remote
git remote add origin https://github.com/ваш-username/MAKC-tree-of-promises.git

# Отправьте код
git branch -M main
git push -u origin main
```

### Шаг 2: Подключите репозиторий к Vercel

1. Перейдите на [vercel.com/new](https://vercel.com/new)
2. Войдите через GitHub/GitLab/Bitbucket
3. Нажмите **"Add New..."** → **"Project"**
4. Найдите репозиторий **MAKC-tree-of-promises** и нажмите **"Import"**

### Шаг 3: Настройте проект

Vercel автоматически определит, что это Vite-проект. Проверьте настройки:

| Параметр | Значение |
|----------|----------|
| **Framework Preset** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

### Шаг 4: Добавьте переменные окружения (если нужны)

Если вы планируете использовать Supabase Auth или другие сервисы:

1. В настройках проекта перейдите в **"Settings"** → **"Environment Variables"**
2. Добавьте переменные:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGc...` |

**Важно:** Выберите все окружения (Production, Preview, Development)

### Шаг 5: Деплой

Нажмите **"Deploy"** и подождите 1-2 минуты.

После завершения вы получите ссылку вида:
```
https://makc-tree-of-promises.vercel.app
```

---

## 💻 Способ 2: Через Vercel CLI

### Шаг 1: Установите Vercel CLI

```bash
npm install -g vercel
```

### Шаг 2: Войдите в аккаунт

```bash
vercel login
```

Откроется браузер для авторизации.

### Шаг 3: Задеплойте проект

```bash
# Перейдите в папку проекта
cd /path/to/MAKC-tree-of-promises

# Задеплойте (preview)
vercel

# Задеплойте на прод
vercel --prod
```

Vercel задаст несколько вопросов при первом деплое:

```
? Set up and deploy "~/MAKC-tree-of-promises"? [Y/n]
→ Y

? Which scope do you want to deploy to?
→ Выберите ваш аккаунт

? Link to existing project? [y/N]
→ N (для первого деплоя)

? What's your project's name?
→ makc-tree-of-promises

? In which directory is your code located?
→ ./

? Want to override the settings? [y/N]
→ N
```

---

## 🔄 Автоматические деплои

После подключения репозитория к Vercel:

- **Push в `main`** → автоматический деплой на прод
- **Pull Request** → автоматический preview-деплой
- **Push в любую ветку** → preview-деплой для этой ветки

---

## 🌐 Настройка кастомного домена

### Шаг 1: Добавьте домен в Vercel

1. Перейдите в **Settings** → **Domains**
2. Введите ваш домен, например: `promises.yourcompany.com`
3. Vercel покажет DNS-записи, которые нужно добавить

### Шаг 2: Настройте DNS у регистратора домена

Добавьте следующие записи:

**Для apex-домена (example.com):**
```
Type: A
Name: @
Value: 76.76.21.21
```

**Для поддомена (promises.example.com):**
```
Type: CNAME
Name: promises
Value: cname.vercel-dns.com
```

### Шаг 3: Дождитесь активации

DNS может обновляться от 5 минут до 48 часов. После активации:
- SSL-сертификат выдаётся автоматически
- Домен работает с HTTPS

---

## 📊 Мониторинг и аналитика

### Vercel Analytics

Включите встроенную аналитику:

1. Перейдите в **Analytics** в панели проекта
2. Нажмите **"Enable"**
3. Выберите план (бесплатный план включает базовую аналитику)

### Логи

Просматривайте логи деплоев и runtime-логи:

1. Перейдите в **Deployments** для просмотра истории деплоев
2. Перейдите в **Logs** для просмотра runtime-логов

---

## 🔧 Решение проблем

### Проблема: Белый экран после деплоя

**Причина:** Неправильные пути к ассетам

**Решение:** Проверьте `vite.config.js`:

```javascript
export default {
  base: '/', // Убедитесь, что base правильный
  build: {
    outDir: 'dist'
  }
}
```

### Проблема: 404 при обновлении страницы

**Причина:** SPA-роутинг не настроен

**Решение:** Убедитесь, что `vercel.json` содержит:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### Проблема: Переменные окружения не работают

**Причина:** Переменные не добавлены в Vercel

**Решение:**
1. Добавьте переменные в **Settings** → **Environment Variables**
2. **Пересоздайте деплой** (переменные применяются только при сборке)

```bash
vercel --prod
```

### Проблема: Долгая сборка

**Причина:** Vercel кэширует node_modules, но первая сборка может быть медленной

**Решение:** Добавьте в `package.json`:

```json
{
  "scripts": {
    "build": "vite build"
  }
}
```

---

## 📦 Оптимизация для продакшена

### 1. Включите gzip-сжатие

Vercel автоматически сжимает ассеты, но можно добавить заголовки:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

### 2. Добавьте мета-теги

В `index.html`:

```html
<meta name="description" content="MAKC-tree-of-promises - Интерактивное дерево обещаний компании" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

### 3. Добавьте favicon

Создайте `public/favicon.ico` или используйте SVG:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

---

## 🎯 Чек-лист перед деплоем

- [ ] Код загружен в Git-репозиторий
- [ ] Все изменения закоммичены и запушены
- [ ] Переменные окружения добавлены в Vercel (если нужны)
- [ ] Проект успешно собирается локально (`npm run build`)
- [ ] Проверена работа всех функций
- [ ] Добавлены мета-теги для SEO
- [ ] Настроен favicon
- [ ] Проверена работа на мобильных устройствах
- [ ] Проверена работа в разных браузерах

---

## 📚 Полезные ссылки

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel CLI](https://vercel.com/docs/cli)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
- [Custom Domains on Vercel](https://vercel.com/docs/concepts/projects/domains/add-a-domain)

---

## 💡 Советы

1. **Используйте preview-деплои** для тестирования перед мерджем в main
2. **Настройте автоматические деплои** для удобства
3. **Мониторьте логи** для быстрого обнаружения проблем
4. **Используйте кастомный домен** для профессионального вида
5. **Включите аналитику** для отслеживания использования

---

## 🎉 Готово!

После деплоя ваш проект будет доступен по адресу:
```
https://makc-tree-of-promises.vercel.app
```

Или по вашему кастомному домену, если вы его настроили.

**Демо-доступ к админ-панели:**
- Логин: `admin`
- Пароль: `promises`
