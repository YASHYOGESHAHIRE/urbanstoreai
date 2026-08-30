-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL DEFAULT 'urban_store',
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "subcategoryId" TEXT NOT NULL,
    "subcategoryName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageAlt" TEXT NOT NULL DEFAULT '',
    "useCases" TEXT[],
    "suitableFor" TEXT[],
    "notSuitableFor" TEXT[],
    "characteristics" JSONB NOT NULL DEFAULT '{}',
    "similarTo" TEXT[],
    "alternativeTo" TEXT[],
    "compatibleWith" TEXT[],
    "complements" TEXT[],
    "upgradeTo" TEXT[],
    "frequentlyBoughtWith" TEXT[],
    "requiresVariantSelect" BOOLEAN NOT NULL DEFAULT false,
    "maxQtyPerOrder" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "priceAmount" INTEGER NOT NULL,
    "priceCurrency" TEXT NOT NULL DEFAULT 'INR',
    "mrpAmount" INTEGER NOT NULL,
    "mrpCurrency" TEXT NOT NULL DEFAULT 'INR',
    "availabilityStatus" TEXT NOT NULL,
    "quantityAvailable" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "products_subcategoryId_idx" ON "products"("subcategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- CreateIndex
CREATE INDEX "product_variants_availabilityStatus_idx" ON "product_variants"("availabilityStatus");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
