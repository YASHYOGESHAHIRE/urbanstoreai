import { Truck, RotateCcw, Shield, CreditCard } from "lucide-react";

const footerItems = [
  { icon: Truck, text: "Free delivery on orders above ₹999" },
  { icon: RotateCcw, text: "Easy returns within 7 days" },
  { icon: Shield, text: "Secure payments" },
  { icon: CreditCard, text: "Pay later available" },
];

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-8">
      <div className="max-w-[1400px] mx-auto px-6 py-4">
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
          {footerItems.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2">
              <Icon size={15} className="text-gray-400 flex-shrink-0" />
              <span className="text-[12px] text-gray-500">{text}</span>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
