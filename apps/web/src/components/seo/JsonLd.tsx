// Renders a JSON-LD <script> in the document head. Google reads structured
// data at crawl time and uses it for rich results (FAQ accordions in SERPs,
// review stars, breadcrumbs, etc).
//
// We dangerouslySetInnerHTML the JSON because React would otherwise escape
// quotes inside <script>; that's safe because we control the data shape.

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
