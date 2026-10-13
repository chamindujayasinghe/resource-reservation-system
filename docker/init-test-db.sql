-- Runs once, when the database volume is first created.
-- Integration tests use this database so they never touch development data.
CREATE DATABASE reservations_test;
