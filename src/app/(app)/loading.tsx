// Shown inside the app layout while a signed-in page loads its data, so a
// click always gives visible feedback.
export default function AppLoading() {
  return (
    <p role="status" className="py-12 text-center text-muted-foreground">
      Loading...
    </p>
  );
}
