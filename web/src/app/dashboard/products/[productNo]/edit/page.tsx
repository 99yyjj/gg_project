"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

import ProductForm, {
  ProductFormValues,
  emptyFormValues,
} from "@/components/product-form";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/lib/api";
import { useMe, useProduct, useUpdateProduct } from "@/lib/queries";

export default function EditProductPage() {
  const params = useParams<{ productNo: string }>();
  const productNo = Number(params.productNo);
  const router = useRouter();
  const toast = useToast();

  const { data: me } = useMe();
  const { data: product, isLoading } = useProduct(
    Number.isFinite(productNo) ? productNo : undefined
  );
  const update = useUpdateProduct(productNo);

  const [values, setValues] = useState<ProductFormValues>(emptyFormValues());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!product || hydrated) return;
    setValues({
      product_name: product.product_name ?? "",
      price: product.price != null ? String(Math.trunc(product.price)) : "",
      supply_price: "",
      description: product.description ?? "",
      category_no: product.category_no != null ? String(product.category_no) : "",
      display: (product.display === "F" ? "F" : "T") as "T" | "F",
      selling: (product.selling === "F" ? "F" : "T") as "T" | "F",
      detail_image: product.detail_image ?? "",
      list_image: product.list_image ?? "",
      detail_image_file: null,
      list_image_file: null,
      delete_detail_image: false,
      delete_list_image: false,
    });
    setHydrated(true);
  }, [product, hydrated]);

  async function handleSubmit() {
    if (!values.product_name.trim()) {
      toast.push("상품명을 입력하세요.", "err");
      return;
    }
    try {
      const res = await update.mutateAsync({
        product_name: values.product_name,
        price: values.price ? Number(values.price) : undefined,
        supply_price: values.supply_price ? Number(values.supply_price) : undefined,
        description: values.description || undefined,
        category_no: values.category_no ? Number(values.category_no) : undefined,
        display: values.display,
        selling: values.selling,
        detail_image_file: values.detail_image_file,
        list_image_file: values.list_image_file,
        delete_detail_image: values.delete_detail_image,
        delete_list_image: values.delete_list_image,
      });
      toast.push(res.message);
      res.warnings?.forEach((w) => toast.push(w, "err"));
      router.replace(`/dashboard/products/${productNo}`);
    } catch (e) {
      toast.push(errorMessage(e, "수정에 실패했습니다."), "err");
    }
  }

  if (isLoading || !hydrated) {
    return <div className="text-slate-900">불러오는 중...</div>;
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">상품 수정</h1>
          <p className="text-sm text-slate-900 mt-1">
            #{productNo} · 변경 사항이 Cafe24에 즉시 반영됩니다.
          </p>
        </div>
        {me?.username && (
          <Link
            href={`/shop/${me.username}/products/${productNo}`}
            target="_blank"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink className="w-4 h-4" />
            저장된 페이지
          </Link>
        )}
      </header>
      <ProductForm
        values={values}
        setValues={setValues}
        submitting={update.isPending}
        submitLabel="Cafe24에 반영"
        onSubmit={handleSubmit}
        username={me?.username}
        shopName={me?.shop_name ?? me?.username}
      />
    </div>
  );
}
