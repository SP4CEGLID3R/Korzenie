-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateEnum
CREATE TYPE "app"."TreeVisibility" AS ENUM ('PRIVATE', 'LINK', 'PUBLIC');

-- CreateEnum
CREATE TYPE "app"."TreeRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "app"."Sex" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "app"."LivingStatus" AS ENUM ('AUTO', 'LIVING', 'DECEASED');

-- CreateEnum
CREATE TYPE "app"."NameType" AS ENUM ('BIRTH', 'MARRIED', 'RECORDED', 'ALIAS');

-- CreateEnum
CREATE TYPE "app"."NameLanguage" AS ENUM ('PL', 'LA', 'RU', 'DE', 'OTHER');

-- CreateEnum
CREATE TYPE "app"."ParentChildType" AS ENUM ('BIOLOGICAL', 'ADOPTIVE', 'FOSTER', 'STEP', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "app"."UnionType" AS ENUM ('MARRIAGE', 'PARTNERSHIP', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "app"."EventType" AS ENUM ('BIRTH', 'BAPTISM', 'MARRIAGE', 'DIVORCE', 'DEATH', 'BURIAL', 'RESIDENCE', 'EMIGRATION', 'OTHER');

-- CreateEnum
CREATE TYPE "app"."DateQualifier" AS ENUM ('EXACT', 'ABOUT', 'BEFORE', 'AFTER', 'BETWEEN');

-- CreateEnum
CREATE TYPE "app"."ParticipantRole" AS ENUM ('PRINCIPAL', 'GROOM', 'BRIDE', 'FATHER', 'MOTHER', 'GODPARENT', 'WITNESS', 'INFORMANT', 'OTHER');

-- CreateEnum
CREATE TYPE "app"."Partition" AS ENUM ('RUSSIAN', 'PRUSSIAN', 'AUSTRIAN', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "app"."SourceKind" AS ENUM ('GENETEKA', 'WIKIDATA', 'WIKIMEDIA_COMMONS', 'USER_SCAN', 'GEDCOM_IMPORT', 'ARCHIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "app"."RecordType" AS ENUM ('BIRTH', 'BAPTISM', 'MARRIAGE', 'DEATH', 'BURIAL', 'PERSON', 'OTHER');

-- CreateEnum
CREATE TYPE "app"."MatchStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "app"."ResearchTaskKind" AS ENUM ('FIND_BIRTH', 'FIND_MARRIAGE', 'FIND_DEATH', 'FIND_SIBLINGS', 'FIND_PARENTS', 'OTHER');

-- CreateEnum
CREATE TYPE "app"."ResearchTaskStatus" AS ENUM ('OPEN', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "app"."MediaKind" AS ENUM ('PHOTO', 'SCAN', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "app"."StoryType" AS ENUM ('BIOGRAPHY', 'HISTORICAL_CONTEXT');

-- CreateTable
CREATE TABLE "app"."User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Tree" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "app"."TreeVisibility" NOT NULL DEFAULT 'PRIVATE',
    "shareToken" TEXT,
    "ownerId" UUID NOT NULL,
    "homePersonId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."TreeMember" (
    "treeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "app"."TreeRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreeMember_pkey" PRIMARY KEY ("treeId","userId")
);

-- CreateTable
CREATE TABLE "app"."Person" (
    "id" UUID NOT NULL,
    "treeId" UUID NOT NULL,
    "sex" "app"."Sex" NOT NULL DEFAULT 'UNKNOWN',
    "livingStatus" "app"."LivingStatus" NOT NULL DEFAULT 'AUTO',
    "notes" TEXT,
    "gedcomId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."PersonName" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "type" "app"."NameType" NOT NULL DEFAULT 'BIRTH',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "givenNames" TEXT NOT NULL,
    "surname" TEXT,
    "birthSurname" TEXT,
    "language" "app"."NameLanguage" NOT NULL DEFAULT 'PL',
    "variants" TEXT[],
    "givenNamesNorm" TEXT,
    "surnameNorm" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PersonName_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ParentChild" (
    "id" UUID NOT NULL,
    "parentId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "type" "app"."ParentChildType" NOT NULL DEFAULT 'BIOLOGICAL',

    CONSTRAINT "ParentChild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Union" (
    "id" UUID NOT NULL,
    "treeId" UUID NOT NULL,
    "partner1Id" UUID NOT NULL,
    "partner2Id" UUID NOT NULL,
    "type" "app"."UnionType" NOT NULL DEFAULT 'MARRIAGE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Union_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Event" (
    "id" UUID NOT NULL,
    "treeId" UUID NOT NULL,
    "type" "app"."EventType" NOT NULL,
    "dateQualifier" "app"."DateQualifier",
    "dateYear" INTEGER,
    "dateMonth" INTEGER,
    "dateDay" INTEGER,
    "dateEndYear" INTEGER,
    "dateEndMonth" INTEGER,
    "dateEndDay" INTEGER,
    "dateText" TEXT,
    "dateSort" INTEGER,
    "placeId" UUID,
    "unionId" UUID,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."EventParticipant" (
    "eventId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "role" "app"."ParticipantRole" NOT NULL DEFAULT 'PRINCIPAL',

    CONSTRAINT "EventParticipant_pkey" PRIMARY KEY ("eventId","personId","role")
);

-- CreateTable
CREATE TABLE "app"."Place" (
    "id" UUID NOT NULL,
    "treeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parish" TEXT,
    "municipality" TEXT,
    "county" TEXT,
    "province" TEXT,
    "country" TEXT,
    "partition" "app"."Partition",
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "wikidataId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."PlaceName" (
    "id" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "language" "app"."NameLanguage" NOT NULL DEFAULT 'PL',
    "fromYear" INTEGER,
    "toYear" INTEGER,
    "note" TEXT,

    CONSTRAINT "PlaceName_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Source" (
    "id" UUID NOT NULL,
    "treeId" UUID,
    "kind" "app"."SourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "publisher" TEXT,
    "citationText" TEXT,
    "license" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Record" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "externalId" TEXT,
    "type" "app"."RecordType" NOT NULL,
    "url" TEXT NOT NULL,
    "signature" TEXT,
    "year" INTEGER,
    "parish" TEXT,
    "raw" JSONB NOT NULL,
    "normalized" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Citation" (
    "id" UUID NOT NULL,
    "personId" UUID,
    "eventId" UUID,
    "recordId" UUID,
    "sourceId" UUID,
    "detail" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."SourceQueryCache" (
    "key" TEXT NOT NULL,
    "kind" "app"."SourceKind" NOT NULL,
    "response" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceQueryCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "app"."Match" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "explanation" JSONB NOT NULL,
    "status" "app"."MatchStatus" NOT NULL DEFAULT 'PENDING',
    "algorithmVersion" TEXT NOT NULL,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ResearchTask" (
    "id" UUID NOT NULL,
    "treeId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "kind" "app"."ResearchTaskKind" NOT NULL,
    "title" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "status" "app"."ResearchTaskStatus" NOT NULL DEFAULT 'OPEN',
    "originMatchId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Media" (
    "id" UUID NOT NULL,
    "treeId" UUID NOT NULL,
    "kind" "app"."MediaKind" NOT NULL,
    "storagePath" TEXT,
    "externalUrl" TEXT,
    "mimeType" TEXT,
    "title" TEXT,
    "description" TEXT,
    "author" TEXT,
    "license" TEXT,
    "licenseUrl" TEXT,
    "sourcePageUrl" TEXT,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."MediaPerson" (
    "mediaId" UUID NOT NULL,
    "personId" UUID NOT NULL,

    CONSTRAINT "MediaPerson_pkey" PRIMARY KEY ("mediaId","personId")
);

-- CreateTable
CREATE TABLE "app"."Story" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "type" "app"."StoryType" NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."AiCall" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."AiCache" (
    "key" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "app"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Tree_shareToken_key" ON "app"."Tree"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "Tree_homePersonId_key" ON "app"."Tree"("homePersonId");

-- CreateIndex
CREATE INDEX "Tree_ownerId_idx" ON "app"."Tree"("ownerId");

-- CreateIndex
CREATE INDEX "TreeMember_userId_idx" ON "app"."TreeMember"("userId");

-- CreateIndex
CREATE INDEX "Person_treeId_idx" ON "app"."Person"("treeId");

-- CreateIndex
CREATE INDEX "PersonName_personId_idx" ON "app"."PersonName"("personId");

-- CreateIndex
CREATE INDEX "PersonName_surnameNorm_idx" ON "app"."PersonName"("surnameNorm");

-- CreateIndex
CREATE INDEX "ParentChild_childId_idx" ON "app"."ParentChild"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentChild_parentId_childId_key" ON "app"."ParentChild"("parentId", "childId");

-- CreateIndex
CREATE INDEX "Union_treeId_idx" ON "app"."Union"("treeId");

-- CreateIndex
CREATE INDEX "Union_partner2Id_idx" ON "app"."Union"("partner2Id");

-- CreateIndex
CREATE UNIQUE INDEX "Union_partner1Id_partner2Id_key" ON "app"."Union"("partner1Id", "partner2Id");

-- CreateIndex
CREATE INDEX "Event_treeId_type_idx" ON "app"."Event"("treeId", "type");

-- CreateIndex
CREATE INDEX "Event_placeId_idx" ON "app"."Event"("placeId");

-- CreateIndex
CREATE INDEX "Event_unionId_idx" ON "app"."Event"("unionId");

-- CreateIndex
CREATE INDEX "EventParticipant_personId_idx" ON "app"."EventParticipant"("personId");

-- CreateIndex
CREATE INDEX "Place_treeId_idx" ON "app"."Place"("treeId");

-- CreateIndex
CREATE INDEX "Place_wikidataId_idx" ON "app"."Place"("wikidataId");

-- CreateIndex
CREATE INDEX "PlaceName_placeId_idx" ON "app"."PlaceName"("placeId");

-- CreateIndex
CREATE INDEX "Source_treeId_idx" ON "app"."Source"("treeId");

-- CreateIndex
CREATE INDEX "Record_type_year_idx" ON "app"."Record"("type", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Record_sourceId_externalId_key" ON "app"."Record"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "Citation_personId_idx" ON "app"."Citation"("personId");

-- CreateIndex
CREATE INDEX "Citation_eventId_idx" ON "app"."Citation"("eventId");

-- CreateIndex
CREATE INDEX "SourceQueryCache_expiresAt_idx" ON "app"."SourceQueryCache"("expiresAt");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "app"."Match"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Match_personId_recordId_key" ON "app"."Match"("personId", "recordId");

-- CreateIndex
CREATE INDEX "ResearchTask_personId_status_idx" ON "app"."ResearchTask"("personId", "status");

-- CreateIndex
CREATE INDEX "Media_treeId_idx" ON "app"."Media"("treeId");

-- CreateIndex
CREATE INDEX "MediaPerson_personId_idx" ON "app"."MediaPerson"("personId");

-- CreateIndex
CREATE INDEX "Story_personId_type_idx" ON "app"."Story"("personId", "type");

-- CreateIndex
CREATE INDEX "AiCall_userId_createdAt_idx" ON "app"."AiCall"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "app"."Tree" ADD CONSTRAINT "Tree_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Tree" ADD CONSTRAINT "Tree_homePersonId_fkey" FOREIGN KEY ("homePersonId") REFERENCES "app"."Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TreeMember" ADD CONSTRAINT "TreeMember_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "app"."Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TreeMember" ADD CONSTRAINT "TreeMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Person" ADD CONSTRAINT "Person_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "app"."Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."PersonName" ADD CONSTRAINT "PersonName_personId_fkey" FOREIGN KEY ("personId") REFERENCES "app"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ParentChild" ADD CONSTRAINT "ParentChild_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "app"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ParentChild" ADD CONSTRAINT "ParentChild_childId_fkey" FOREIGN KEY ("childId") REFERENCES "app"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Union" ADD CONSTRAINT "Union_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "app"."Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Union" ADD CONSTRAINT "Union_partner1Id_fkey" FOREIGN KEY ("partner1Id") REFERENCES "app"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Union" ADD CONSTRAINT "Union_partner2Id_fkey" FOREIGN KEY ("partner2Id") REFERENCES "app"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Event" ADD CONSTRAINT "Event_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "app"."Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Event" ADD CONSTRAINT "Event_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "app"."Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Event" ADD CONSTRAINT "Event_unionId_fkey" FOREIGN KEY ("unionId") REFERENCES "app"."Union"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."EventParticipant" ADD CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "app"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."EventParticipant" ADD CONSTRAINT "EventParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "app"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Place" ADD CONSTRAINT "Place_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "app"."Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."PlaceName" ADD CONSTRAINT "PlaceName_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "app"."Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Source" ADD CONSTRAINT "Source_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "app"."Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Record" ADD CONSTRAINT "Record_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "app"."Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Citation" ADD CONSTRAINT "Citation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "app"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Citation" ADD CONSTRAINT "Citation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "app"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Citation" ADD CONSTRAINT "Citation_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "app"."Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Citation" ADD CONSTRAINT "Citation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "app"."Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Match" ADD CONSTRAINT "Match_personId_fkey" FOREIGN KEY ("personId") REFERENCES "app"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Match" ADD CONSTRAINT "Match_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "app"."Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Match" ADD CONSTRAINT "Match_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ResearchTask" ADD CONSTRAINT "ResearchTask_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "app"."Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ResearchTask" ADD CONSTRAINT "ResearchTask_personId_fkey" FOREIGN KEY ("personId") REFERENCES "app"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Media" ADD CONSTRAINT "Media_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "app"."Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Media" ADD CONSTRAINT "Media_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."MediaPerson" ADD CONSTRAINT "MediaPerson_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "app"."Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."MediaPerson" ADD CONSTRAINT "MediaPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "app"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Story" ADD CONSTRAINT "Story_personId_fkey" FOREIGN KEY ("personId") REFERENCES "app"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."AiCall" ADD CONSTRAINT "AiCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
