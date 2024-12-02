/*
  Warnings:

  - You are about to drop the column `history` on the `Users` table. All the data in the column will be lost.
  - You are about to drop the `Post` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_userId_fkey";

-- AlterTable
ALTER TABLE "Users" DROP COLUMN "history";

-- DropTable
DROP TABLE "Post";

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "Trasactions" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "Trasactions_pkey" PRIMARY KEY ("id")
);
