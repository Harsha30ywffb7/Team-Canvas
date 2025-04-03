import AuthButton from "@/components/AuthButton";

export default function Navbar() {
  return (
    <nav className="p-4 border-b flex justify-between">
      <h1 className="text-xl font-bold">Collaborative Whiteboard</h1>
      <AuthButton />
    </nav>
  );
}
