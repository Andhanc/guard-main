#!/bin/bash

# Скрипт для развертывания PlagiarismGuard на сервере

set -e

echo "🚀 Начало развертывания PlagiarismGuard..."

# Проверка наличия Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен. Установите Docker и повторите попытку."
    exit 1
fi

# Проверка наличия Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose не установлен. Установите Docker Compose и повторите попытку."
    exit 1
fi

# Проверка наличия .env.local
if [ ! -f .env.local ]; then
    echo "⚠️  Файл .env.local не найден."
    if [ -f .env.local.example ]; then
        echo "📋 Создаю .env.local из примера..."
        cp .env.local.example .env.local
        echo "✅ Файл .env.local создан из .env.local.example"
    elif [ -f env.bsuir.local.example ]; then
        echo "📋 Создаю .env.local из примера env.bsuir.local.example..."
        cp env.bsuir.local.example .env.local
        echo "✅ Файл .env.local создан из env.bsuir.local.example"
    else
        echo "❌ Файлы .env.local.example или env.bsuir.local.example не найдены."
        exit 1
    fi
    echo ""
    echo "⚠️  ВАЖНО: Отредактируйте .env.local и укажите правильные значения:"
    echo "   - LDAP_BIND_PASSWORD (пароль для LDAP)"
    echo "   - REPORT_ACCESS_SECRET (секретный ключ для отчетов, минимум 16 символов)"
    echo "   - NEXT_PUBLIC_APP_URL (публичный URL приложения, опционально)"
    echo ""
    echo "   Затем запустите скрипт снова: ./deploy.sh"
    exit 0
fi

# Создание директории для данных, если не существует
echo "📁 Создание директорий для данных..."
mkdir -p data/uploads data/reports data/logs

# Остановка существующих контейнеров
echo "🛑 Остановка существующих контейнеров..."
docker-compose down || true

# Сборка образов
echo "🔨 Сборка Docker образов..."
docker-compose build --no-cache

# Запуск контейнеров
echo "▶️  Запуск контейнеров..."
docker-compose up -d

# Ожидание запуска
echo "⏳ Ожидание запуска приложения..."
sleep 5

# Проверка статуса
echo "📊 Статус контейнеров:"
docker-compose ps

echo ""
echo "✅ Развертывание завершено!"
echo ""
echo "Приложение доступно по адресу: http://localhost:3000"
echo ""
echo "Полезные команды:"
echo "  - Просмотр логов: docker-compose logs -f"
echo "  - Остановка: docker-compose down"
echo "  - Перезапуск: docker-compose restart"
echo ""
