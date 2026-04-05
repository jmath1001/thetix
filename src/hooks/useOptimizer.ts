import { useState } from 'react'

export function useOptimizer(onRefresh: () => void) {
  const [proposal, setProposal] = useState<any>(null)
  const [isApplying, setIsApplying] = useState(false)

  // This function takes the AI's JSON and opens the preview modal
  const openPreview = (aiResponse: any) => {
    if (aiResponse?.type === 'proposal') {
      setProposal(aiResponse)
    }
  }

  // This function simulates the database write for the demo
  const confirmChanges = async (changes: any[]) => {
    setIsApplying(true)
    
    // Simulate network delay for the demo "wow" effect
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    console.log("DEMO: Successfully 'updated' these records:", changes)
    
    setIsApplying(false)
    setProposal(null)
    
    if (onRefresh) onRefresh() // Refresh your local state
  }

  return {
    proposal,
    isApplying,
    openPreview,
    confirmChanges,
    closePreview: () => setProposal(null)
  }
}