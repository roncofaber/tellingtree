import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonsTab } from "@/components/tree/PersonsTab";
import { RelationshipsTab } from "@/components/tree/RelationshipsTab";

export function PeopleTabWrapper({ treeId }: { treeId: string }) {
  return (
    <Tabs defaultValue="people" className="flex flex-col h-full min-h-0">
      <TabsList variant="line" className="shrink-0 mb-2">
        <TabsTrigger value="people">People</TabsTrigger>
        <TabsTrigger value="relationships">Relationships</TabsTrigger>
      </TabsList>
      <TabsContent value="people" className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <PersonsTab treeId={treeId} />
      </TabsContent>
      <TabsContent value="relationships" className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <RelationshipsTab treeId={treeId} />
      </TabsContent>
    </Tabs>
  );
}
