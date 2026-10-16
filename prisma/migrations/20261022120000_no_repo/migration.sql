-- Cuentas sin repositorio: el promo.yaml se guarda en la base.
ALTER TABLE "App" ALTER COLUMN "repo" DROP NOT NULL;
ALTER TABLE "App" ADD COLUMN "manifestYaml" TEXT;
