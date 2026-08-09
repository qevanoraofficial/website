export type Product = {
  id: string;
  category: string;
  categoryName: string;
  name: string;
  shortDescription?: string;
  fullDescription?: string;
  description?: string;
  price: number;
  stock: number;
  active: boolean;
  image?: string;
  imagePath?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TransactionTestimonial = {
  id: string;
  status?: string;
  name?: string;
  telegram?: string;
  whatsapp?: string;
  productName?: string;
  productPrice?: number;
  quantity?: number;
  payment?: string;
  totalPrice?: number;
  purchaseDate?: string;
  image?: string;
  imagePath?: string;
  createdAt?: string;
  updatedAt?: string;
};
