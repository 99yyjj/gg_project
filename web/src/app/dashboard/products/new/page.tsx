"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import ProductForm, {
  ProductFormValues,
  emptyFormValues,
} from "@/components/product-form";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/lib/api";
import {
  addAdditionalImagesRequest,
  useCreateProduct,
  useMe,
} from "@/lib/queries";

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
        summary_description: values.summary_description || undefined,
        description: values.description,
        display: values.display,
        tags: values.tags,
        detail_image_file: values.detail_image_file,
        list_image_file: values.list_image_file,
      });
      // 상품이 생긴 뒤에야 product_no 로 상세 이미지를 올릴 수 있다.
      // 실패해도 상품 등록 자체는 성공이므로 경고만 띄우고 진행한다.
      if (values.additional_image_files.length) {
        try {
          await addAdditionalImagesRequest(
            res.product.product_no,
            values.additional_image_files
          );
        } catch (e) {
          toast.push(
            errorMessage(
              e,
              "상품은 등록됐지만 상세 이미지 업로드에 실패했습니다. 수정 화면에서 다시 추가해 주세요."
            ),
            "err"
          );
        }
      }
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
