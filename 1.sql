-- 1. Включаем расширение для генерации UUID (уникальных ID)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Создаем типы данных для платежей
DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    -- Убрал 'balance' отсюда
    CREATE TYPE payment_method AS ENUM ('card', 'bonus');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =================================================================
-- СОЗДАНИЕ ТАБЛИЦ
-- =================================================================

-- 3. Таблица ПОЛЬЗОВАТЕЛИ (users)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    passport VARCHAR(50),
    license VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Таблица АВТОМОБИЛИ (cars)
CREATE TABLE IF NOT EXISTS cars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    price_per_minute NUMERIC(10, 2) NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Таблица БРОНИРОВАНИЯ (bookings)
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    car_id UUID NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Таблица ПЛАТЕЖИ (payments)
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    type VARCHAR(20) NOT NULL CHECK (type IN ('rental', 'fine', 'deposit', 'refund')),
    status payment_status NOT NULL DEFAULT 'pending',
    method payment_method NOT NULL,
    transaction_external_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =================================================================
-- ИНДЕКСЫ (Для ускорения работы базы данных)
-- =================================================================
CREATE INDEX IF NOT EXISTS idx_cars_category ON cars(category);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);


-- =================================================================
-- ЗАПОЛНЕНИЕ БАЗЫ ДАННЫХ (Автопарк из вашего HTML)
-- =================================================================
-- Добавляем авто, только если их еще нет в базе
INSERT INTO cars (model, category, price_per_minute, is_available)
SELECT 'VW Polo', 'economy', 12.00, true
WHERE NOT EXISTS (SELECT 1 FROM cars WHERE model = 'VW Polo');

INSERT INTO cars (model, category, price_per_minute, is_available)
SELECT 'Toyota Camry', 'comfort', 22.00, true
WHERE NOT EXISTS (SELECT 1 FROM cars WHERE model = 'Toyota Camry');

INSERT INTO cars (model, category, price_per_minute, is_available)
SELECT 'BMW 5 Series', 'business', 35.00, true
WHERE NOT EXISTS (SELECT 1 FROM cars WHERE model = 'BMW 5 Series');

INSERT INTO cars (model, category, price_per_minute, is_available)
SELECT 'VW Crafter', 'special', 28.00, true
WHERE NOT EXISTS (SELECT 1 FROM cars WHERE model = 'VW Crafter');