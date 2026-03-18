export default function SrOnly({ children, as: Tag = 'span', ...props }) {
  return <Tag className="sr-only" {...props}>{children}</Tag>;
}
