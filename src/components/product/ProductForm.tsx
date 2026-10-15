"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Button, Input, Select } from "@/components/common";
import { toast } from "@/lib/toast-store";
import { HsnSuggest } from "@/components/product/HsnSuggest";
import type { Product } from "@/types/product";

const formSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  sku: z.string().min(1, "SKU is required"),
  barcode: z.string().optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  unitId: z.string().min(1, "Unit is required"),
  hsnCode: z.string().optional(),
  purchasePrice: z.coerce.number().min(0, "Must be 0 or more"),
  sellingPrice: z.coerce.number().min(0, "Must be 0 or more"),
  mrp: z.coerce.number().min(0).optional(),
  gstRate: z.coerce.number().min(0).max(100),
  openingStock: z.coerce.number().min(0).optional(),
  minimumStock: z.coerce.number().min(0),
  maximumStock: z.coerce.number().min(0).optional(),
  description: z.string().optional(),
  image: z.string().optional(),
  status: z.boolean(),
});

type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

interface Option {
  id: number;
  name: string;
}

export function ProductForm({ product }: { product?: Product }) {
  const router = useRouter();
  const isEdit = Boolean(product);
  const [categories, setCategories] = useState<Option[]>([]);
  const [units, setUnits] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: product
      ? {
          name: product.name,
          sku: product.sku,
          barcode: product.barcode ?? "",
          categoryId: product.categoryId ? String(product.categoryId) : "",
          brandId: product.brandId ? String(product.brandId) : "",
          unitId: String(product.unitId),
          hsnCode: product.hsnCode ?? "",
          purchasePrice: product.purchasePrice,
          sellingPrice: product.sellingPrice,
          mrp: product.mrp ?? undefined,
          gstRate: product.gstRate,
          minimumStock: product.minimumStock,
          maximumStock: product.maximumStock ?? undefined,
          description: product.description ?? "",
          image: product.image ?? "",
          status: product.status,
        }
      : {
          gstRate: 0,
          minimumStock: 0,
          openingStock: 0,
          status: true,
        },
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/units").then((r) => r.json()),
      fetch("/api/brands").then((r) => r.json()),
    ]).then(([c, u, b]) => {
      setCategories(c);
      setUnits(u);
      setBrands(b);
    });
  }, []);

  async function onSubmit(values: FormOutput) {
    setSaving(true);
    const payload = {
      ...values,
      categoryId: values.categoryId ? Number(values.categoryId) : null,
      brandId: values.brandId ? Number(values.brandId) : null,
      unitId: Number(values.unitId),
      mrp: values.mrp ?? null,
      maximumStock: values.maximumStock ?? null,
    };

    const res = await fetch(isEdit ? `/api/products/${product!.id}` : "/api/products", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      toast.error(data.error ?? "Failed to save product.");
      return;
    }
    toast.success(isEdit ? "Product updated." : "Product created.");
    router.push("/products");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 rounded-lg border border-slate-200 bg-white p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Input label="Product Name *" {...register("name")} error={errors.name?.message} />
        <Input label="SKU *" {...register("sku")} error={errors.sku?.message} />
        <Input label="Barcode" {...register("barcode")} />

        <Select label="Category *" {...register("categoryId")} error={errors.categoryId?.message}>
          <option value="">Select category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        <Select label="Brand" {...register("brandId")}>
          <option value="">Select brand</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>

        <Select label="Unit *" {...register("unitId")} error={errors.unitId?.message}>
          <option value="">Select unit</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>

        <Input label="HSN Code" {...register("hsnCode")} />
        <Input label="Purchase Price *" type="number" step="0.01" {...register("purchasePrice")} error={errors.purchasePrice?.message} />
        <Input label="Selling Price *" type="number" step="0.01" {...register("sellingPrice")} error={errors.sellingPrice?.message} />
        <Input label="MRP" type="number" step="0.01" {...register("mrp")} />
        <Input label="GST %" type="number" step="0.01" {...register("gstRate")} error={errors.gstRate?.message} />

        <div className="sm:col-span-2 lg:col-span-3">
          <HsnSuggest
            name={watch("name") ?? ""}
            hsn={watch("hsnCode") ?? ""}
            onPick={(code, rate) => {
              setValue("hsnCode", code, { shouldDirty: true });
              if (rate !== null) setValue("gstRate", rate, { shouldDirty: true, shouldValidate: true });
            }}
          />
        </div>

        {isEdit ? (
          <Input label="Current Stock" value={product!.currentStock} disabled />
        ) : (
          <Input label="Opening Stock" type="number" step="0.01" {...register("openingStock")} />
        )}

        <Input label="Minimum Stock" type="number" step="0.01" {...register("minimumStock")} error={errors.minimumStock?.message} />
        <Input label="Maximum Stock" type="number" step="0.01" {...register("maximumStock")} />
        <Input label="Product Image URL" {...register("image")} />

        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600">
          <input type="checkbox" {...register("status")} className="h-4 w-4 rounded border-slate-300" />
          Active
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700">Description</label>
        <textarea
          {...register("description")}
          rows={3}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/products")}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {isEdit ? "Update Product" : "Save Product"}
        </Button>
      </div>
    </form>
  );
}
