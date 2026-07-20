/*
  Warnings:

  - Added the required column `updated_at` to the `call_logs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "call_logs" ADD COLUMN     "customer_email" TEXT,
ADD COLUMN     "customer_name" TEXT,
ADD COLUMN     "customer_phone" TEXT,
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;
