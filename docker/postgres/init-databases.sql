-- Runs once on first container start (postgres image convention: /docker-entrypoint-initdb.d).
-- orders-management and warehouse each get their own database on the same Postgres instance.
CREATE DATABASE orders_management;
CREATE DATABASE warehouse;
