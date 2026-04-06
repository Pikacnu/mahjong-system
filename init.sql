CREATE USER code_storage_user WITH PASSWORD 'code_storage_password';
CREATE DATABASE "code-storage";
GRANT ALL PRIVILEGES ON DATABASE "code-storage" TO code_storage_user;

\c "code-storage"
GRANT ALL ON SCHEMA public TO code_storage_user;

CREATE USER mahjong_base_user WITH PASSWORD 'mahjong_base_password';
CREATE DATABASE "mahjong-base";
GRANT ALL PRIVILEGES ON DATABASE "mahjong-base" TO mahjong_base_user;

\c "mahjong-base"
GRANT ALL ON SCHEMA public TO mahjong_base_user;

CREATE USER mahjong_game_user WITH PASSWORD 'mahjong_game_password';
CREATE DATABASE "mahjong-game";
GRANT ALL PRIVILEGES ON DATABASE "mahjong-game" TO mahjong_game_user;

\c "mahjong-game"
GRANT ALL ON SCHEMA public TO mahjong_game_user;