"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import ProductForm, {
  ProductFormValues,
  emptyFormValues,
} from "@/components/product-form";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/lib/api";
import { useCreateProduct, useMe } from "@/lib/queries";

export default function NewProductPage() {
  const [values, setValues] = useState<ProductFormValues>(emptyFormValues());
  const router = useRouter();
  const toast = useToast();
  const create = useCreateProduct();
  const { data: me } = useMe();

  async function handleSubmit() {
    if (!values.product_name.trim()) {
      toast.push("상품명을 입력하세요.", "err");
      return;
    }
    if (!values.price || Number(values.price) <= 0) {
      toast.push("판매가를 입력하세요.", "err");
      return;
    }
    if (!values.description.trim()) {
      toast.push("상세 문구를 입력하거나 AI로 채워주세요.", "err");
      return;
    }
    try {
      const res = await create.mutateAsync({
        product_name: values.product_name,
        price: Number(values.price),
        supply_price: values.supply_price ? Number(values.supply_price) : undefined,
        description: values.description,
        category_no: values.category_no ? Number(values.category_no) : undefined,
        display: values.display,
        selling: values.selling,
        detail_image_file: values.detail_image_file,
        list_image_file: values.list_image_file,
      });
      toast.push(res.message);
      res.warnings?.forEach((w) => toast.push(w, "err"));
      router.replace(`/dashboard/products/${res.product.product_no}`);
    } catch (e) {
      toast.push(errorMessage(e, "등록에 실패했습니다."), "err");
    }
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">신규 상품 등록</h1>
        <p className="text-sm text-slate-900 mt-1">
          입력한 정보가 Cafe24에 즉시 등록됩니다.
        </p>
      </header>
      <ProductForm
        values={values}
        setValues={setValues}
        submitting={create.isPending}
        submitLabel="Cafe24에 등록"
        onSubmit={handleSubmit}
        username={me?.username}
        shopName={me?.shop_name ?? me?.username}
      />
    </div>
  );
}
